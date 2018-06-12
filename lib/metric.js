/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */

var mod_assert = require('assert-plus');

var lib_provider = require('./provider');

/*
 * Basic building block for counters and gauges. This object is not intended to
 * be used directly by users.
 * This object exposes the basic functionality of metrics, like
 * add(), subtract(), and observe(). The higher layers (counters, gauges,
 * summaries, histograms) will wrap these functions and restrict access
 * to only the functions that are supported by the collector type (for example,
 * counters can only call add() while gauges can call either add() or subtract()
 * but not observe()).
 */
function Metric(options) {
    mod_assert.optionalObject(options, 'options');
    mod_assert.optionalBool(options.expires, 'options.expires');
    mod_assert.optionalNumber(options.defaultValue, 'options.defaultValue');
    mod_assert.optionalNumber(options.expiryPeriod, 'options.expiryPeriod');

    this.labels = options ? options.labels : {};

    this.expires = false;
    if (options && options.expires) {
        this.expires = options.expires;
    }
    this.defaultValue = 0;
    if (options && options.defaultValue) {
        this.defaultValue = options.defaultValue;
    }
    /*
     * The expiryPeriod is time period after which the metric is reset to its
     * default value if the metric timestamp is not updated due to a call to the
     * add or set methods.
     */
    this.expiryPeriod = 300000;
    if (options && options.expiryPeriod) {
        this.expiryPeriod = options.expiryPeriod;
    }

    this.value = this.defaultValue;

    // ISO 8601 time when this metric was last updated.
    this.timestamp = null;

    this.expiryTimer = null;
}

/*
 * Building block for upper-level functions like add(), subtract(),
 * observe() (because it uses Counters). This does not check
 * for positive/negative values. That should be handled at an upper layer.
 */
Metric.prototype.add = function add(num) {
    mod_assert.number(num, 'num');

    var self = this;

    if (this.expiryTimer) {
        clearTimeout(this.expiryTimer);
        this.expiryTimer = null;
    }

    lib_provider['metric-add'].fire(function () {
        return ([num, self.labels]);
    });

    this.value += num;
    this.timestamp = new Date().toISOString();

    if (this.expires) {
        this.expiryTimer =
            setTimeout(this.resetValue.bind(this), this.expiryPeriod);
    }
};

Metric.prototype.set = function set(num) {
    mod_assert.number(num, 'num');

    var self = this;

    if (this.expiryTimer) {
        clearTimeout(this.expiryTimer);
        this.expiryTimer = null;
    }

    lib_provider['metric-set'].fire(function () {
        return ([num, self.labels]);
    });

    this.value = num;
    this.timestamp = new Date().toISOString();

    if (this.expires) {
        this.expiryTimer =
            setTimeout(this.resetValue.bind(this), this.expiryPeriod);
    }
};

Metric.prototype.getValue = function getValue() {
    return (this.value);
};

Metric.prototype.resetValue = function resetValue() {
    lib_provider['metric-reset'].fire(function () {
        return ([this.defaultValue, this.labels]);
    });

    this.value = this.defaultValue;
    this.timestamp = new Date().toISOString();
};

module.exports = {
    Metric: Metric
};
