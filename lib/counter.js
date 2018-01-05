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
 * A Counter is a type of collector that can only increase in value by calling
 * functions 'add()' and 'increment()'.
 */
function Counter(options) {
    this.type = lib_common.COUNTER;
    lib_common.constructor(options, this);
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

/*
 * Returns the value of a metric with the provided labels.
 */
Counter.prototype.getValue = function getValue(pairs) {
    mod_assert.optionalObject(pairs, 'pairs');

    var metric = this.getWithLabels(pairs);
    if (metric) {
        return (metric.getValue());
    }
    return (new VError({name: lib_common.NOEXISTERROR}));
};

/* Private Functions */
/*
 * Returns a Metric object that represents the labels passed in. If a Metric
 * exists with the given labels in the MetricVector, it will be returned without
 * creating a new Metric. If no labels are specified, the 'default' metric
 * (that is, the Metric with no labels) is returned.
 */
Counter.prototype.labels = function labels(pairs) {
    return (lib_common.labels(pairs, this));
};

/*
 * Returns a Metric object that represents the labels passed in. Differs from
 * this.labels() by returning 'null' if no Metric exists.
 */
Counter.prototype.getWithLabels = function getWithLabels(pairs) {
    return (lib_common.getWithLabels(pairs, this));
};

/*
 * Call the 'prometheus()' function on the MetricVector object, which represents
 * all of the metrics. Additionally, append the HELP and TYPE lines that are
 * specific to this metric.
 */
Counter.prototype.prometheus = function prometheus(cb) {
    lib_common.prometheus(cb, this);
};

module.exports = {
    Counter: Counter
};
