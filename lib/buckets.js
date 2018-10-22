/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */

var assert = require('assert-plus');


function fixDecimals(value) {
    var fixed;

    // keep 4 decimal places when < 10, otherwise use integers.
    if (value < 10) {
        fixed = +(value.toFixed(4));
    } else {
        fixed = Math.ceil(value);
    }

    return (fixed);
}


function linearBuckets(min, width, count) {
    var buckets = [];
    var i;
    var n = min;

    assert.number(min, 'min', 'min is required');
    assert.number(width, 'width', 'width is required');
    assert.number(count, 'count', 'count is required');
    assert.ok(width > 0, 'width must be > 0');
    assert.ok(count > 0, 'count must be > 0');
    assert.ok(min > 0, 'min must be > 0, you probably want min=' + width);

    // TODO:
    // - sanity limit on count?

    for (i = 0; i < count; i++) {
        buckets.push(fixDecimals(n));
        n += width;
    }

    return (buckets);
}


function exponentialBuckets(min, factor, count) {
    var buckets = [];
    var i;
    var n = min;
    var step;

    assert.number(min, 'min', 'min is required');
    assert.number(factor, 'factor', 'factor is required');
    assert.number(count, 'count', 'count is required');
    assert.ok(min > 0, 'min must be > 0');

    // TODO
    // - limit on factor?
    // - sanity limit on count?

    for (i = 0; i < count; i++) {
        buckets.push(fixDecimals(n));
        n *= factor;
    }

    return (buckets);
}


/*
 * This function generates an array of log-linear buckets.
 *
 * For each magnitude from lowPower to highPower, we will create linear steps of
 * width (base^magnitude) / bucketsPerMagnitude and add these values to the
 * resulting array if they do not already fall into a smaller magnitude's
 * buckets (since we will already have those datapoints at higher resolution)..
 *
 */
function logLinearBuckets(base, lowPower, highPower, bucketsPerMagnitude) {
    var bucketIdx;
    var buckets = [];
    var curMagnitudeLastBucket;
    var exponent;
    var prevMagnitudeLastBucket = 0;
    var value;

    assert.number(base, 'base');
    assert.number(lowPower, 'lowPower');
    assert.number(highPower, 'highPower');
    assert.number(bucketsPerMagnitude, 'bucketsPerMagnitude');
    assert.ok(lowPower < highPower, 'lowPower must be < highPower');
    assert.ok(base > 0, 'base must be positive');
    assert.ok(bucketsPerMagnitude > 0, 'bucketsPerMagnitude must be positive');

    // TODO
    // - more sanity checks

    for (exponent = lowPower; exponent <= highPower; exponent++) {
        // This will be the largest bucket in the magnitude
        curMagnitudeLastBucket = Math.pow(base, exponent + 1);

        // Figure out the size of each step in this magnitude.
        step = curMagnitudeLastBucket / bucketsPerMagnitude;

        for (bucketIdx = 1; bucketIdx < bucketsPerMagnitude; bucketIdx++) {
            value = fixDecimals(bucketIdx * step);

            // Skip values that are handled in finer detail by the previous
            // magnitude's buckets.
            if (value > prevMagnitudeLastBucket) {
                buckets.push(value);
            }
        }

        // Push the last one without multiplying by step, so that it ends
        // exactly without worrying Javascript numbers.
        buckets.push(fixDecimals(curMagnitudeLastBucket));

        prevMagnitudeLastBucket = buckets[buckets.length - 1];
    }

    return (buckets);
}


module.exports = {
    exponentialBuckets: exponentialBuckets,
    linearBuckets: linearBuckets,
    logLinearBuckets: logLinearBuckets
};
