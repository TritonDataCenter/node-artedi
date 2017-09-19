/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2017, Joyent, Inc.
 */
var mod_util = require('util');

var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');
var VError = require('verror').VError;

var lib_utils = require('./utils');
var lib_counter = require('./counter');
var lib_gauge = require('./gauge');
var lib_common = require('./common');

/*
 * A Histogram is a type of collector that represents a series of Counters. Each
 * Counter corresponds to a certain range of values, called 'buckets.'
 */
function Histogram(options) {
    mod_assert.object(options, 'options');
    mod_assert.string(options.name, 'options.name');
    mod_assert.string(options.help, 'options.help');
    mod_assert.optionalObject(options.labels, 'options.labels');
    mod_assert.optionalObject(options.parentLabels, 'options.parentLabels');

    this.staticLabels =
        mod_jsprim.mergeObjects(options.parentLabels, options.labels, null);

    this.name = options.name;
    this.help = options.help;
    this.type = lib_common.HISTOGRAM;

    this.counters = {};
    this.gauge = new lib_gauge.Gauge(options);
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
    if (value < 0) {
        throw new VError('observe must be called with a value >= 0: %d', value);
    }

    var counter;
    var pairCopy;
    var buckets;
    var index, count, i, bucket;
    var smaller;

    // For log-linear bucketing, we will produce five linear steps per log jump.
    // At a point in the future, we may allow the user to provide this value,
    // but five seems like a reasonable default.
    var linearSteps = 5;

    pairs = mod_jsprim.mergeObjects(pairs, this.staticLabels, null);
    counter = this.labels(pairs);

    // Make a copy of the labels sent in.
    pairCopy = mod_jsprim.deepCopy(pairs);

    /* Begin setting initial value for new buckets (if applicable). */

    // Determine which bucket from the new order our value falls into.
    buckets = getOrder(value, linearSteps);
    if (!buckets) {
        // The value passed in is too big (> 10 billion), so we just increment
        // the +Inf counter, and add to the Gauge.
        counter.increment({
            le: '+Inf'
        });
        this.gauge.add(value, counter.staticLabels);
        return;
    }

    // Find the largest bucket that the observed value falls into.
    for (bucket in buckets) {
        if (value <= buckets[bucket]) {
            index = buckets[bucket];
            break;
        }
    }

    // Find the next-smallest bucket from the list of already-used buckets.
    // The buckets are sorted when they are added to a metric vector.
    for (bucket in counter.metricVec.buckets) {
        if (counter.metricVec.buckets[bucket] < index) {
            smaller = bucket;
        }
    }

    // Check to see if the proper bucket for this value already exists in
    // the bucket list.
    if (counter.metricVec.buckets.indexOf(index) === -1) {
        counter.metricVec.addBuckets(buckets);
        if (smaller) {
            // Copy value from the next-smallest bucket into the newly created
            // buckets.
            pairCopy['le'] = counter.metricVec.buckets[smaller];
            count = counter.labels(pairCopy).value;
            if (count > 0) {
                for (bucket in buckets) {
                    // In the case of overlapping buckets, we don't want to
                    // double the value of the bucket.
                    if (buckets[bucket] !==
                            counter.metricVec.buckets[smaller]) {
                        pairCopy['le'] = buckets[bucket];
                        counter.add(count, pairCopy); // Set the initial value.
                    }
                }
            }
        }
    }
    /* Done setting initial value for new buckets. */

    // Now we need to increment the Counters for the buckets >= the value
    // passed in.
    buckets = counter.metricVec.buckets;
    index = buckets.indexOf(index);
    for (i = 0; i < buckets.length; i++) {
        pairCopy['le'] = buckets[i];
        if (i < index) {
            // We don't need to increment buckets that are smaller than what we
            // received, but we do want to zero them out if they don't exist.
            counter.labels(pairCopy);
            continue;
        }
        counter.increment(pairCopy);
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

/*
 * Find (and return) a list of linear numbers that 'value' falls into.
 * The 'steps' argument is provided, as we may allow the user to specify
 * the number of linear 'steps' between logarithmic jumps. This idea is taken
 * from DTrace's log/linear quantization ('llquantize()').
 */
function getOrder(value, steps) {
    var i, j, val, width, next;
    var buckets = [];

    // These values are relatively arbitrary. It's possible that we may want to
    // allow the user to change these at some point.
    var factor = 10;
    var low = 0;

    // This is an arbitrary high watermark. Setting this allows us to ensure
    // that our loop will always exit.
    // The maximum value that we can observe (without it falling into only the
    // +Inf bucket is 10^10, or 10,000,000,000.
    var high = 10;

    val = 1;
    for (i = low; i <= high; i++) {
        next = val * factor;
        width = next > steps ? next / steps : 1;

        for (j = 0; val <= next; val += width, j++) {
            buckets[j] = val;
        }

        // Overlap buckets so we get something like:
        // [0-10], [10-100], [100-1000].
        val -= width;
        if (value <= buckets[buckets.length - 1]) {
            // The number is within this order.
            return (buckets);
        }
    }
    return (null);
}

module.exports = {
    Histogram: Histogram
};
