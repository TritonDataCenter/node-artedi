/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2017, Joyent, Inc.
 */

var mod_assert = require('assert-plus');

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
    this.labels = options ? options.labels : {};
    this.value = 0;
    this.timestamp = 0;
}

/*
 * Building block for upper-level functions like add(), subtract(),
 * observe() (because it uses Counters). This does not check
 * for positive/negative values. That should be handled at an upper layer.
 */
Metric.prototype.add = function add(num) {
    mod_assert.number(num, 'num');

    this.value += num;
    this.timestamp = Date.now(); // Current unix time in milliseconds.
};

module.exports = {
    Metric: Metric
};
