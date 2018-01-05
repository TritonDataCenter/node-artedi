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

var lib_metric = require('./metric');
var lib_utils = require('./utils');

/*
 * MetricVectors are used to keep track of multiple metrics in one object.
 * This is useful when the collector type can handle multiple label key/value
 * pairs. A good example of this is counting web requests, and metering them
 * based on method, and return code. There will be many different values for
 * both 'method' and 'return code', but they are logically the same metric, so
 * we can use metric vectors to accomplish that abstraction.
 *
 * This object is not intended to be used directly by users.
 *
 */
function MetricVector(opts) {
    mod_assert.string(opts.name, 'opts.name');
    mod_assert.optionalObject(opts.labels, 'opts.labels');

    this.name = opts.name;
    this.metrics = {};

    this.staticLabels = opts.labels;
    if (this.staticLabels) {
        this.staticLabels = lib_utils.trim(this.staticLabels);
        var err = lib_utils.checkValid(this.staticLabels);
        if (err !== null) {
            throw new VError(err, 'invalid labels');
        }
    }
    this.buckets = []; // Used for Histograms.
}

/*
 * Appends 'newBuckets' to the list of buckets currently managed by this
 * MetricVector.
 */
MetricVector.prototype.addBuckets = function addBuckets(newBuckets) {
    newBuckets.forEach(function (bucket) {
        if (this.buckets.indexOf(bucket) === -1) {
            this.buckets.push(bucket);
        }
    }, this);
    this.buckets.sort(function (a, b) { return a - b; });
};

/*
 * Returns a Metric with no labels, or with only the static labels defined
 * for this MetricVector.
 */
MetricVector.prototype.getDefault = function getDefault() {
    // defaultMetric is a metric with only static labels (if provided).
    if (!this.metrics['default']) {
        this.metrics['default'] = new lib_metric.Metric({
            labels: this.staticLabels
        });
    }
    return (this.metrics['default']);
};

/*
 * Returns a previously-created Metric representing 'labels,' or 'null' if
 * the Metric has not been created.
 */
MetricVector.prototype.getWithLabels = function getWithLabels(labels) {
    mod_assert.object(labels, 'labels');

    /*
     * If the user tries to 'get' a metric that has already been assigned
     * static labels, we shouldn't accidentally create a second metric with
     * identical non-static labels.
     */
    if (this.metrics['default'] && mod_jsprim.deepEqual(labels,
                this.metrics['default'].labels)) {
        return (this.metrics['default']);
    }

    var lhash = lib_utils.hashObj(labels);
    return (this.metrics[lhash]);
};

/*
 * Returns a newly-created Metric representing 'labels.'
 */
MetricVector.prototype.createWithLabels = function createWithLabels(labels) {
    mod_assert.object(labels, 'labels');
    var copy = lib_utils.shallowClone(labels);
    var lhash = lib_utils.hashObj(copy);

    // Before we create the metric, append the static labels.
    if (this.staticLabels) {
        for (var label in this.staticLabels) {
            copy[label] = this.staticLabels[label];
        }
    }

    this.metrics[lhash] = new lib_metric.Metric({labels: copy});
    return (this.metrics[lhash]);
};

/*
 * Create, or retrieve a Metric representing 'labels.' This calls
 * 'getWithLabels(),' followed by 'createWithLabels()' if the Metric doesn't
 * exist.
 */
MetricVector.prototype.createOrGetWithLabels =
    function createOrGetWithLabels(labels) {
    mod_assert.object(labels, 'labels');
    var met = this.getWithLabels(labels);
    if (typeof (met) !== 'undefined' && met !== null) {
        return (met);
    }
    return (this.createWithLabels(labels));
};

/*
 * Serialize this object into the format of prometheus metrics.
 * For example:
 *
 * # HELP http_requests_completed count of muskie requests completed
 * # TYPE http_requests_completed counter
 * http_requests_completed{method="getmetrics",code="200"} 505
 * http_requests_completed{method="getstorage",code="404"} 1
 * http_requests_completed{method="headstorage",code="200"} 3
 * http_requests_completed{method="getstorage",code="200"} 1
 * http_requests_completed{method="putobject",code="204"} 33
 * http_requests_completed{method="putdirectory",code="204"} 173
 * http_requests_completed{method="putdirectory",code="403"} 1
 *
 */
MetricVector.prototype.prometheus = function prometheus(cb) {
    mod_assert.func(cb, 'cb');
    var str = '';
    var labelStr = '';
    var name = this.name;

    var appendLabel = function (key, value) {
            labelStr += mod_util.format('%s="%s",', key, value);
    };

    // TODO O(M*N) - make faster?
    mod_jsprim.forEachKey(this.metrics, function (_, metric) {
        // Generate the labels and their values.
        mod_jsprim.forEachKey(metric.labels, appendLabel);

        // Chop off trailing ','.
        labelStr = labelStr.substring(0, labelStr.length - 1);

        // Put together the whole string.
        str += mod_util.format('%s{%s} %d\n', name, labelStr, metric.value);

        labelStr = '';
    });
    cb(null, str);
};

module.exports = {
    MetricVector: MetricVector
};
