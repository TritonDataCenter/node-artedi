/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2017, Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');
var VError = require('verror').VError;

var mod_md5 = require('md5');

/*
 * This is a similar regex to the one used in the golang prometheus client lib.
 * The Go client doesn't validate against a regex (citing bad performance), and
 * actually have a hard-coded `if` statement that checks each string.
 * That's something we could consider if we see performance issues with this.
 *
 * Also, if we want to support multiple formats we can do away with this and
 * only check for validity at the time when we serialize the metrics.
 */
var regex = new RegExp('^[a-zA-Z_][a-zA-Z0-9_]*$');

function shallowClone(obj) {
    mod_assert.object(obj, 'obj');

    var clone = {};
    mod_jsprim.forEachKey(obj, function (key, value) {
        clone[key] = value;
    });

    return (clone);
}

/*
 * To ensure that we don't store duplicate metrics, we must hash all of
 * the metrics before they're stored. This function takes an object of labels.
 * The labels are sorted alphabetically, sent through stringify, and then their
 * md5 hash is calculated. This should be adequately unique for our case.
 */
function hashObj(obj) {
    mod_assert.object(obj, 'obj');

    var newObj = {};
    var keys = Object.keys(obj).sort();
    keys.forEach(function (key) {
        newObj[key] = obj[key];
    });
    return (mod_md5(JSON.stringify(newObj)));
}

/*
 * Loop through the label object, trim off left- and right- whitespace.
 */
function trim(labels) {
    mod_assert.object(labels, 'labels');

    var keys = Object.keys(labels);
    var trimmed = keys.reduce(function (newObj, key) {
        newObj[key.trim()] = typeof (labels[key]) === 'string' ?
            labels[key].trim() : labels[key];
        return (newObj);
    }, {});

    return (trimmed);

}

/*
 * Check the name and help strings given to collectors.
 */
function checkValidCollector(name, help) {
    var err = null;

    // Collector names must be strings, and pass the regex test.
    if (typeof (name) !== 'string' || regex.test(name) === false) {
        err = new VError('name "%s" must match regex "%s', name, regex);
    }

    // Collector 'help' messages must be strings.
    if (typeof (help) !== 'string') {
        err = new VError('help "%s" must be a string', help);
    }

    return (err);
}

/*
 * Check the validity of labels.
 */
function checkValid(labels) {
    mod_assert.optionalObject(labels, 'labels');

    var err = null;
    if (!labels) {
        return (null);
    }

    mod_jsprim.forEachKey(labels, function (name, value) {
        if (err !== null) {
            // Short-circuit the rest of the for-each functions if we've already
            // found an invalid string.
            return;
        }

        // Test the label name for validity.
        if (typeof (name) === 'string') {
            if (regex.test(name) === false) {
                err = new VError('label key "%s" must match regex "%s"',
                    name, regex);
                return;
            }
        } else {
            err = new VError('label key must be a string', name);
            return;
        }

        // Test the label value for validity.
        if (typeof (value) !== 'string' && typeof (value) !== 'number' &&
                typeof (value) !== 'boolean') {
            err = new VError('label value "%s" must be one of ' +
                    '[string, number, bool]',
                    value, typeof (value));
            return;
        }
    });
    return (err);
}

module.exports = {
    shallowClone: shallowClone,
    hashObj: hashObj,
    checkValidCollector: checkValidCollector,
    checkValid: checkValid,
    trim: trim
};
