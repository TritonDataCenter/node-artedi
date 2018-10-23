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
    var decimals;

    // If the number is < 10, figure out the magnitude of the value and then
    // use that to determine the appropriate number of decimal digits.
    if (value < 10) {
        decimals = Math.max(Math.abs(Math.floor(Math.log10(value))) + 1, 4);
        fixed = +(value.toFixed(decimals));
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

    assert.number(min, 'min', 'min is required');
    assert.number(factor, 'factor', 'factor is required');
    assert.number(count, 'count', 'count is required');
    assert.ok(min > 0, 'min must be > 0');

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
    var step;
    var value;

    assert.number(base, 'base');
    assert.number(lowPower, 'lowPower');
    assert.number(highPower, 'highPower');
    assert.number(bucketsPerMagnitude, 'bucketsPerMagnitude');
    assert.ok(lowPower < highPower, 'lowPower must be < highPower');
    assert.ok(base > 0, 'base must be positive');
    assert.ok(bucketsPerMagnitude > 0, 'bucketsPerMagnitude must be positive');

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
