/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */
var mod_assert = require('assert-plus');
var VError = require('verror').VError;

var lib_common = require('./common');

/*
 * A Gauge is a type of collector that can increase and decrease in value.
 * This Gauge only supports 'relative' movement of values through the 'add()'
 * function.
 */
function Gauge(options) {
    this.type = lib_common.GAUGE;
    lib_common.constructor(options, this);
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

/*
 * Sets the value of the Metric represented by the labels, 'pairs.'
 */
Gauge.prototype.set = function set(value, pairs) {
    mod_assert.optionalObject(pairs, 'pairs');
    mod_assert.number(value, 'value');

    var metric = this.labels(pairs);
    metric.set(value);
};

/*
 * Returns the value of a metric with the provided labels.
 */
Gauge.prototype.getValue = function getValue(pairs) {
    mod_assert.optionalObject(pairs, 'pairs');

    var metric = this.getWithLabels(pairs);
    if (metric) {
        return (metric.getValue());
    }
    return (new VError({name: lib_common.NOEXISTERROR}));
};


/* Private Functions */
Gauge.prototype.labels = function labels(pairs) {
    return (lib_common.labels(pairs, this));
};

Gauge.prototype.getWithLabels = function getWithLabels(pairs) {
    return (lib_common.getWithLabels(pairs, this));
};

Gauge.prototype.prometheus = function prometheus(cb) {
    lib_common.prometheus(cb, this);
};

module.exports = {
    Gauge: Gauge
};
