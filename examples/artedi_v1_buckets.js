/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * IMPORTANT:
 *
 * This file exists to provide an example of how to create buckets that are
 * compatible with node-artedi version 1.x only for purposes of updating to
 * node-artedi version 2.x (see docs/migrating.md).
 *
 * It is not recommended to use these buckets for new code.
 *
 */

var assert = require('assert-plus');


// These are all the different bucket values node-artedi 1.x could generate
// which it called "log-linear" though these values are not compatible with
// other log-linear quantizations such as llquantize in DTrace.
var POSSIBLE_ARTEDI_1_BUCKETS = [
    0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.0006, 0.0007, 0.0008, 0.0009,
    0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009,
    0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09,
    0.18, 0.27, 0.36, 0.45, 0.54, 0.63, 0.72, 0.81,
    1.62, 2.43, 3.24, 4.05, 4.86, 5.67, 6.48, 7.29, 8.1,
    25, 42, 59, 76,
    228, 380, 532, 684,
    2052, 3420, 4788, 6156,
    18468, 30780, 43092, 55404,
    166212, 277020, 387828, 498636,
    1495908, 2493180, 3490452, 4487724,
    13463172, 22438620, 31414068, 40389516,
    121168548, 201947580, 282726612, 363505644,
    1090516932, 1817528220, 2544539508, 3271550796 ];

var POSSIBLE_ARTEDI_1_BUCKETS_MIN_MIN = POSSIBLE_ARTEDI_1_BUCKETS[0];
var POSSIBLE_ARTEDI_1_BUCKETS_MAX_MIN =
    POSSIBLE_ARTEDI_1_BUCKETS[POSSIBLE_ARTEDI_1_BUCKETS.length - 2];
var POSSIBLE_ARTEDI_1_BUCKETS_MAX_MAX =
    POSSIBLE_ARTEDI_1_BUCKETS[POSSIBLE_ARTEDI_1_BUCKETS.length - 1];


function artedi1Buckets(min, max) {
    if (max === undefined) {
        max = POSSIBLE_ARTEDI_1_BUCKETS_MAX_MAX;
    }
    if (min === undefined) {
        min = POSSIBLE_ARTEDI_1_BUCKETS_MIN_MIN;
    }

    assert.number(min, 'min', 'min is required');
    assert.number(max, 'max', 'max is required');
    assert.ok(min < max, 'min must be < max');
    assert.ok(min <= POSSIBLE_ARTEDI_1_BUCKETS_MAX_MIN, 'min must be <= ' +
        POSSIBLE_ARTEDI_1_BUCKETS_MAX_MIN);
    assert.ok(max <= POSSIBLE_ARTEDI_1_BUCKETS_MAX_MAX, 'max must be <= ' +
        POSSIBLE_ARTEDI_1_BUCKETS_MAX_MAX);

    var begin;
    var buckets = [];
    var i;
    var end;

    // Shortcut in case they want everything
    if (min === POSSIBLE_ARTEDI_1_BUCKETS_MIN_MIN &&
        max === POSSIBLE_ARTEDI_1_BUCKETS_MAX_MAX) {

        return (POSSIBLE_ARTEDI_1_BUCKETS.slice());
    }

    // find the lowest bucket that's >= min
    i = 0;
    while (POSSIBLE_ARTEDI_1_BUCKETS[i] < min) {
        i++;
    }
    begin = i;

    // find the highest bucket that's >= max
    if (max === POSSIBLE_ARTEDI_1_BUCKETS_MAX_MAX) {
        end = POSSIBLE_ARTEDI_1_BUCKETS.length - 1;
    } else {
        // work backward from the end
        i = POSSIBLE_ARTEDI_1_BUCKETS.length - 1;
        while (POSSIBLE_ARTEDI_1_BUCKETS[i] > max) {
            i--;
        }
        end = i + 1;
    }

    return (POSSIBLE_ARTEDI_1_BUCKETS.slice(begin, end + 1));
}


module.exports = {
    artedi1Buckets: artedi1Buckets,
    POSSIBLE_ARTEDI_1_BUCKETS: POSSIBLE_ARTEDI_1_BUCKETS
};
