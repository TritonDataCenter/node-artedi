/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * provider.js: DTrace probe definitions.
 */

var mod_dtrace_provider = require('dtrace-provider');

var PROBES = {
    /* counter, gauge, and histogram operations */
    /* [metric_name, value, labels] */
    'counter-add': ['char *', 'int', 'json'],
    'gauge-add': ['char *', 'int', 'json'],
    'gauge-set': ['char *', 'int', 'json'],
    'histogram-observe': ['char *', 'int', 'json'],

    /* metric-vector operations */
    /* [metric_name, labels] */
    'create-metric': ['char *', 'json'],

    /* metric operations */
    /* [value, labels] */
    'metric-add': ['int', 'json'],
    'metric-set': ['int', 'json'],
    'metric-reset': ['int', 'json']
};
var PROVIDER;

module.exports = function exportStaticProvider() {
    if (!PROVIDER) {
        PROVIDER = mod_dtrace_provider.createDTraceProvider('artedi');

        Object.keys(PROBES).forEach(function (p) {
            var args = PROBES[p].splice(0);
            args.unshift(p);

            PROVIDER.addProbe.apply(PROVIDER, args);
        });
        PROVIDER.enable();
    }
    return (PROVIDER);
}();
