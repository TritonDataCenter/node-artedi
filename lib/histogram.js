/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */
var mod_util = require('util');

var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');
var VError = require('verror').VError;

var lib_utils = require('./utils');
var lib_counter = require('./counter');
var lib_gauge = require('./gauge');
var lib_common = require('./common');
var lib_provider = require('./provider');


/*
 * These default buckets match the official golang, javascript, rust and other
 * client libraries.
 */
var DEFAULT_BUCKETS = [
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1,
    2.5,
    5,
    10
];


/*
 * A Histogram is a type of collector that represents a series of Counters. Each
 * Counter corresponds to a certain range of values, called 'buckets.'
 */
function Histogram(options) {
    mod_assert.object(options, 'options');
    mod_assert.string(options.name, 'options.name');
    mod_assert.string(options.help, 'options.help');
    mod_assert.optionalArrayOfNumber(options.buckets, 'options.buckets');
    mod_assert.optionalObject(options.labels, 'options.labels');
    mod_assert.optionalObject(options.parentLabels, 'options.parentLabels');

    var i;
    var prevBucket = -1;

    this.staticLabels =
        mod_jsprim.mergeObjects(options.parentLabels, options.labels, null);

    this.name = options.name;
    this.help = options.help;
    this.type = lib_common.HISTOGRAM;

    this.buckets = options.buckets || DEFAULT_BUCKETS;
    this.counters = {};
    this.gauge = new lib_gauge.Gauge(options);

    // Assert that buckets are monotonic
    for (i = 0; i < this.buckets.length; i++) {
        mod_assert.ok(this.buckets[i] > prevBucket,
            'buckets should be monotonic [' + this.buckets[i] +
            ' > ' + prevBucket + ']');
        prevBucket = this.buckets[i];
    }
}

/* Public Functions */
/*
 * Determine which bucket the observed 'value' falls into, and increment all the
 * Counters >= that observed value. The '+Inf' Counter is always incremented,
 * and a Gauge is created to track the running sum of values observed.
 */
Histogram.prototype.observe = function observe(value, pairs) {
    mod_assert.number(value, 'value');
    mod_assert.optionalObject(pairs, 'pairs');

    var name = this.name;
    lib_provider['histogram-observe'].fire(function () {
        return ([name, value, pairs]);
    });

    if (value < 0) {
        throw new VError('observe must be called with a value >= 0: %d', value);
    }

    var i;
    var counter;
    var pairCopy;

    pairs = mod_jsprim.mergeObjects(pairs, this.staticLabels, null);
    counter = this.labels(pairs);

    // Make a copy of the labels sent in.
    pairCopy = mod_jsprim.deepCopy(pairs);

    // Increment the counters for each bucket(le) where "value" is <= the bucket
    for (i = 0; i < this.buckets.length; i++) {
        pairCopy['le'] = this.buckets[i];
        if (value <= this.buckets[i]) {
            counter.increment(pairCopy);
        } else {
            // We don't need to increment buckets that are smaller than value,
            // but we do want to zero them out if they don't exist.
            counter.labels(pairCopy);
        }
    }

    // Always increment the Inf Counter.
    counter.increment({
        le: '+Inf'
    });

    // There is a gauge for each counter so we can keep track
    // of the _sum field (which can move up or down).
    this.gauge.add(value, counter.staticLabels);
};

/* Private Functions */
/*
 * Returns a Counter associated with the givel labels, 'pairs,' and initializes
 * a Gauge which will be used to track the sum of the values added to the
 * Counter.
 */
Histogram.prototype.labels = function labels(pairs) {
    mod_assert.optionalObject(pairs);
    if (!pairs || mod_jsprim.isEmpty(pairs)) {
        return (this.defaultCounter());
    }
    var lhash;
    var opts;
    var my_counter;

    pairs = lib_utils.trim(pairs);
    lhash = lib_utils.hashObj(pairs);
    if (this.counters[lhash]) {
        // We have already recorded this Counter.
        return (this.counters[lhash]);
    }

    // Before we create the Counter, append the static labels.
    pairs = mod_jsprim.mergeObjects(pairs, this.staticLabels, null);

    // Create a new Counter.
    opts = {
        name: this.name,
        help: this.help,
        labels: pairs
    };
    my_counter = new lib_counter.Counter(opts);
    this.gauge.labels(my_counter.staticLabels); // Initialize the gauge.

    this.counters[lhash] = my_counter;
    return (my_counter);
};

/*
 * The 'prometheus()' function for Histograms is more complicated than that of
 * Counters and Gauges.
 *
 * Each Counter represents a number of Metrics (via MetricVectors), so we
 * call 'prometheus()' on each Counter's underlying MetricVector object. After
 * we serialize each Counter, we synthesize the '_count' field and append the
 * '_sum' field. The '_count' field carries the same value as the corresponding
 * Counter's '+Inf' label.
 */
Histogram.prototype.prometheus = function prometheus(cb) {
    mod_assert.func(cb, 'callback');
    var str = '';
    var labelStr = '';
    var counter;
    var keys;
    var countLabels, key, labelObj, label;

    var infHash = lib_utils.hashObj({le: '+Inf'});

    str = mod_util.format('%s %s %s\n', '# HELP', this.name, this.help);
    str += mod_util.format('%s %s %s\n', '# TYPE', this.name, this.type);

    /*
     * We're digging deep in this loop.
     * The objective of this code is to get each Counter's MetricVec
     * to report its metrics in the prometheus style. But we don't want the
     * Counter itself to do that reporting, since then it would add on the
     * '# TYPE' and '# HELP' headers.
     *
     * In addition, we need to serialize extra fields, like the _sum and _count
     * fields. Both of these fields are reported based on label key/value
     * combinations. That information is stored in each of the Metric objects.
     */
    var promCallback = function (err, metrics) {
        if (err) {
            cb(null, err);
        }
        str += metrics;
    };
    for (counter in this.counters) {
        // Bypass the Counter object's .prometheus function, and instead
        // call it on the metricVector itself.
        this.counters[counter].metricVec.prometheus(promCallback);

        // Get the last object in the metric vector. All of the metrics
        // within a metric vector have the same labels.
        keys = Object.keys(this.counters[counter].metricVec.metrics);
        key = keys[0];
        labelStr = '';
        labelObj = {};
        countLabels = this.counters[counter].metricVec.metrics[key].labels;
        for (label in countLabels) {
            if (label !== 'le') {
                // Ignore the internal 'le' label.
                labelStr += mod_util.format('%s="%s",',
                        label, countLabels[label]);
                labelObj[label] = countLabels[label];
            }
        }
        // Chop off the trailing ','
        labelStr = labelStr.substring(0, labelStr.length - 1);

        // Create the _count metric.
        str += mod_util.format('%s_count{%s}', this.name, labelStr);

        // Append the +Inf value to the _count field, since they are the same.
        str += mod_util.format(' %d\n',
                this.counters[counter].metricVec.metrics[infHash].value);

        // Read the _sum Gauge.
        str += mod_util.format('%s_sum{%s}', this.name, labelStr);
        str += mod_util.format(' %d\n', this.gauge.labels(labelObj).value);
    }

    cb(null, str);
};

/*
 * Returns a Counter with no labels. This is used when an observation is made
 * with no labels.
 */
Histogram.prototype.defaultCounter = function defaultCounter() {
    var opts;
    if (!this.counters['default']) {
        opts = {
            name: this.name,
            help: this.help,
            labels: this.staticLabels
        };
        this.counters['default'] = new lib_counter.Counter(opts);
    }
    return (this.counters['default']);
};

module.exports = {
    Histogram: Histogram
};
