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

var lib_metric_vector = require('./metric_vector');
var lib_common = require('./common');

/*
 * A Gauge is a type of collector that can increase and decrease in value.
 * This Gauge only supports 'relative' movement of values through the 'add()'
 * function.
 */
function Gauge(options) {
    mod_assert.object(options, 'options');
    mod_assert.string(options.name, 'options.name');
    mod_assert.string(options.help, 'options.help');
    mod_assert.optionalObject(options.labels, 'options.labels');
    mod_assert.optionalObject(options.parentLabels, 'options.parentLabels');

    this.staticLabels =
        mod_jsprim.mergeObjects(options.parentLabels, options.labels, null);

    this.help = options.help;
    this.type = lib_common.GAUGE;
    this.name = options.name;
    this.metricVec = new lib_metric_vector.MetricVector({
        name: this.name,
        labels: this.staticLabels
    });
}

 /*
  * Add 'value' to the Metric represented by the labels, 'pairs.' This uses the
  * 'labels()' function to find the metric represented by 'pairs.'
  */
Gauge.prototype.add = function add(value, pairs) {
    mod_assert.optionalObject(pairs, 'pairs');
    mod_assert.number(value, 'value');

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
Gauge.prototype.labels = function labels(pairs) {
    mod_assert.optionalObject(pairs, 'pairs');

    if (!pairs || mod_jsprim.isEmpty(pairs)) {
        return (this.metricVec.getDefault());
    }

    return (this.metricVec.createOrGetWithLabels(pairs));
};

/*
 * Call the 'prometheus()' function on the MetricVector object, which represents
 * all of the metrics. Additionally, append the HELP and TYPE lines that are
 * specific to this metric.
 */
Gauge.prototype.prometheus = function prometheus(cb) {
    mod_assert.func(cb, 'cb');
    var str = mod_util.format('%s %s %s\n', '# HELP', this.name, this.help);
    str += mod_util.format('%s %s %s\n', '# TYPE', this.name, this.type);

    this.metricVec.prometheus(function (err, metrics) {
        str += metrics;
        cb(err, str);
    });

};

module.exports = {
    Gauge: Gauge
};
