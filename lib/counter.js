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

var lib_metric_vector = require('./metric_vector');
var lib_common = require('./common');

/*
 * A Counter is a type of collector that can only increase in value by calling
 * functions 'add()' and 'increment()'.
 */
function Counter(options) {
    mod_assert.object(options, 'options');
    mod_assert.string(options.name, 'options.name');
    mod_assert.string(options.help, 'options.help');
    mod_assert.optionalObject(options.labels, 'options.labels');
    mod_assert.optionalObject(options.parentLabels, 'options.parentLabels');

    this.staticLabels =
        mod_jsprim.mergeObjects(options.labels, options.parentLabels, null);

    // Create a full metric name that looks
    // like 'muskie_audit_requests_completed'.
    this.name = options.name;
    this.help = options.help;
    this.metricVec = new lib_metric_vector.MetricVector({
        name: this.name,
        labels: this.staticLabels
    });
    this.type = lib_common.COUNTER;
}

/* Public Functions */
/*
 * Add '1' to the Metric represented by the labels 'pairs.' This uses the
 * 'labels()' function to find the metric represented by 'pairs.'
 */
Counter.prototype.increment = function increment(pairs) {
    this.add(1, pairs);
};

/*
 * Add 'value' to the Metric represented by the labels 'pairs.' This uses the
 * 'labels()' function to find the metric represented by 'pairs.'
 */
Counter.prototype.add = function add(value, pairs) {
    mod_assert.optionalObject(pairs, 'pairs');
    mod_assert.number(value, 'value');
    if (value < 0) {
        throw new VError('adding negative values to counters ' +
                'is not allowed:', value);
    }

    // Get the metric associated with the labels passed in.
    // This will create the metric if one does not exist.
    var metric = this.labels(pairs);
    metric.add(value);
};

/* Private Functions */
/*
 * Returns a Metric object that represents the labels passed in. If a Metric
 * exists with the given labels in the MetricVector, it will be returned without
 * creating a new Metric. If no labels are specified, the 'default' metric
 * (that is, the Metric with no labels) is returned.
 */
Counter.prototype.labels = function labels(pairs) {
    mod_assert.optionalObject(pairs);
    if (!pairs || mod_jsprim.isEmpty(pairs)) { // User passed in '{}'.
        return (this.metricVec.getDefault());
    }

    return (this.metricVec.createOrGetWithLabels(pairs));
};

/*
 * Call the 'prometheus()' function on the MetricVector object, which represents
 * all of the metrics. Additionally, append the HELP and TYPE lines that are
 * specific to this metric.
 */
Counter.prototype.prometheus = function prometheus(cb) {
    var str = mod_util.format('%s %s %s\n', '# HELP', this.name, this.help);
    str += mod_util.format('%s %s %s\n', '# TYPE', this.name, this.type);

    this.metricVec.prometheus(function (err, metrics) {
        str += metrics;
        cb(err, str);
    });
};

module.exports = {
    Counter: Counter
};
