/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */
var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');
var mod_util = require('util');

var lib_metric_vector = require('./metric_vector');

function constructor(options, obj) {
    mod_assert.object(options, 'options');
    mod_assert.string(options.name, 'options.name');
    mod_assert.string(options.help, 'options.help');
    mod_assert.optionalObject(options.labels, 'options.labels');
    mod_assert.optionalObject(options.parentLabels, 'options.parentLabels');

    obj.staticLabels =
        mod_jsprim.mergeObjects(options.parentLabels, options.labels, null);

    obj.help = options.help;
    obj.name = options.name;
    obj.metricVec = new lib_metric_vector.MetricVector({
        name: obj.name,
        labels: obj.staticLabels
    });
}

/*
 * Returns a Metric object that represents the labels passed in. If a Metric
 * exists with the given labels in the MetricVector, it will be returned without
 * creating a new Metric. If no labels are specified, the 'default' metric
 * (that is, the Metric with no labels) is returned.
 */
function labels(pairs, obj) {
    mod_assert.optionalObject(pairs, 'pairs');

    if (!pairs || mod_jsprim.isEmpty(pairs)) {
        return (obj.metricVec.getDefault());
    }

    return (obj.metricVec.createOrGetWithLabels(pairs));
}

function getWithLabels(pairs, obj) {
    mod_assert.optionalObject(pairs, 'pairs');

    if (!pairs || mod_jsprim.isEmpty(pairs)) {
        return (obj.metricVec.getDefault());
    }

    return (obj.metricVec.getWithLabels(pairs));
}

/*
 * Call the 'prometheus()' function on the MetricVector object, which represents
 * all of the metrics. Additionally, append the HELP and TYPE lines that are
 * specific to this metric.
 */
function prometheus(cb, obj) {
    mod_assert.func(cb, 'cb');
    var str = mod_util.format('%s %s %s\n', '# HELP', obj.name, obj.help);
    str += mod_util.format('%s %s %s\n', '# TYPE', obj.name, obj.type);

    obj.metricVec.prometheus(function (err, metrics) {
        str += metrics;
        cb(err, str);
    });
}

module.exports = {
    prometheus: prometheus,
    constructor: constructor,
    labels: labels,
    getWithLabels: getWithLabels,
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    NOEXISTERROR: 'NoExistError'
};
