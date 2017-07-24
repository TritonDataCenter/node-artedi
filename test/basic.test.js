/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2017, Joyent, Inc.
 */

var mod_tape = require('tape');
var mod_vasync = require('vasync');

var mod_artedi = require('..');

var common = require('../lib/common.js');

/*
 * Test that the parent/child relationship is working.
 * - Empty strings
 */
mod_tape('parent/child tests', function (t) {
    var collector = mod_artedi.createCollector();

    var obj = {
        name: 'test_awesome',
        help: 'help me!'
    };
    var counter = collector.counter(obj);

    // Make sure the fullName is being created properly.
    t.equals(counter.name, 'test_awesome', 'basic full name');
    // Make sure the child collector was registered.
    t.ok(collector.registry[counter.name], 'metric registered');

    // Test preventing the user from accidentally
    // overwriting collectors in the collector registry.
    // This gauge has the same full name as the counter previously created.
    t.throws(function () {
        var gauge = collector.gauge(obj);
        gauge.add(100); // This line should not execute.
    }, 'duplicate collector with same name');

    // getCollector should return a child collector from the parent.
    t.ok(collector.getCollector(counter.name), 'get collector by name');

    t.end();
});

mod_tape('trim functionality tests', function (t) {
    var utils = require('../lib/utils');
    var myObj = {
        '         kevin': 'spacey        '
    };
    var targetObj = {
        'kevin': 'spacey'
    };

    var trimObj = utils.trim(myObj);
    t.deepEquals(trimObj, targetObj, 'left- and right-trim');

    myObj = {
        '   neil   ': ' armstrong  ',
        'buzz ': 'aldrin',
        'chris ': ' hadfield',
        'lightyear': ' buzz '
    };
    targetObj = {
        'neil': 'armstrong',
        'buzz': 'aldrin',
        'chris': 'hadfield',
        'lightyear': 'buzz'
    };

    trimObj = utils.trim(myObj);
    t.deepEquals(trimObj, targetObj, 'left- and right-trim of multiple labels');


    t.end();
});

mod_tape('hash tests', function (t) {
    var utils = require('../lib/utils');

    var obj1 = {
        a: 'b',
        b: 'a'
    };
    var obj2 = {
        b: 'a',
        a: 'b'
    };

    var hash1 = utils.hashObj(obj1);
    var hash2 = utils.hashObj(obj2);

    t.equals(hash1, hash2, 'consistent hashing with unordered objects');
    t.end();
});


/*
 * Test that labels are working properly.
 * A few things to test:
 * - Invalid label names                x
 * - No labels                          x
 * - numeric label values               x
 * - Labels with objects as keys        x
 */
mod_tape('label tests', function (t) {
    var collector = mod_artedi.createCollector({
        labels: {
            global: 'label'
        }
    });

    // Create a counter with static labels.
    var counter = collector.counter({
        name: 'test_counter_labels',
        help: 'counters with static labels should work',
        labels: {
            mytag: 'isAwesome'
        }
    });

    // Increment counter with static labels.
    counter.increment();
    t.equals(counter.metricVec.getDefault().value, 1,
        'increment w/ static labels from Collector and Counter');

    counter.increment({
        dynamicLabel: 'pepsi'
    });
    t.equals(counter.labels({
        dynamicLabel: 'pepsi'
    }).value, 1, 'increment w/ dynamic label and static labels');


    counter = collector.counter({
        name: 'counter',
        help: 'counters are fantastic'
    });

    counter.increment();
    t.equals(counter.metricVec.getDefault().value, 1,
            'increment w/ label from Collector');

    // The user gave us a label structure, but no labels.
    counter.add(100, {});
    t.equals(counter.metricVec.getDefault().value, 101,
            'increment with empty label structure');

    // Test for numeric metric values.
    counter.increment({
        method: 'putobject',
        code: 200
    });
    t.equals(counter.labels({
        method: 'putobject',
        code: 200
    }).value, 1, 'numeric label values, multiple labels');

    t.end();
});

/*
 * Test that prometheus serialization happens properly.
 * A few things to test:
 * - No metrics                                 x
 * - Ordering of labels (it shouldn't matter)   x
 */
mod_tape('counter serialization tests', function (t) {
    var collector = mod_artedi.createCollector();

    var counter = collector.counter({
        name: 'bot_demerits',
        help: 'wtf'
    });

    var expected = '# HELP bot_demerits ' + counter.help + '\n';
    expected += '# TYPE bot_demerits ' + common.COUNTER + '\n';

    // collector.collect is async, so we'll force these tests to happen
    // serially so we can accurately predict what collector.collect will output.
    mod_vasync.pipeline({ funcs: [
        function (_, cb) {
            // No metrics present, so we should just see the comments.
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for no metrics');
                t.equals(str, expected, 'no metrics, only comments');
            });
            cb();
        },

        function (_, cb) {
            counter.increment({
                trollcon: '4',
                user: 'kkantor'
            });

            resetTimestamps(counter.metricVec);
            var oneDemerit = expected +
                'bot_demerits{trollcon="4",user="kkantor"} 1 0\n';
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for two labels');
                t.equals(str, oneDemerit, 'two label increment');
            });
            cb();
        },

        function (_, cb) {
            // Note the reversal of labels here (shouldn't make a difference).
            counter.add(1000, {
                user: 'kkantor',
                trollcon: '4'
            });

            resetTimestamps(counter.metricVec);
            /* BEGIN JSSTYLED */
            // eslint-disable-next-line max-len
            var lots = expected + 'bot_demerits{trollcon="4",user="kkantor"} 1001 0\n';
            /* END JSSTYLED */
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for reversed labels');
                t.equals(str, lots, 'reversed label add');
            });
            cb();
        },

        function (_, cb) {
            collector = mod_artedi.createCollector();
            counter = collector.counter({
                name: 'test',
                help: 'help'
            });
            counter.increment();
            counter.increment();
            counter.increment();

            resetTimestamps(counter.metricVec);
            expected = '' +
                '# HELP test help\n' +
                '# TYPE test ' + common.COUNTER + '\n' +
                'test{} 3 0\n';

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for default counter');
                t.equals(str, expected, 'default counter');
            });
            cb();
        }]
    }, function (_, result) {
        t.end();
    });

});

mod_tape('histogram serialization tests', function (t) {
    var collector = mod_artedi.createCollector();

    var histogram = collector.histogram({
        name: 'bot_trolololol',
        help: 'there is no help'
    });
    var expected = '# HELP bot_trolololol there is no help\n';
    expected += '# TYPE bot_trolololol ' + common.HISTOGRAM + '\n';

    mod_vasync.pipeline({ funcs: [
        function (_, cb) {
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for no metrics');
                t.equals(str, expected, 'no labels or data points');
            });
            cb();
        },

        function (_, cb) {
            histogram.observe(1, {
                'key': 'value'
            });

            expected = expected +
                'bot_trolololol{key="value",le="1"} 1 0\n' +
                'bot_trolololol{key="value",le="3"} 1 0\n' +
                'bot_trolololol{key="value",le="5"} 1 0\n' +
                'bot_trolololol{key="value",le="7"} 1 0\n' +
                'bot_trolololol{key="value",le="9"} 1 0\n' +
                'bot_trolololol{le="+Inf",key="value"} 1 0\n' +
                'bot_trolololol_count{key="value"} 1 0\n' +
                'bot_trolololol_sum{key="value"} 1 0\n';

            resetTimestamps(histogram.gauge.metricVec);
            Object.keys(histogram.counters).forEach(function (counter) {
                resetTimestamps(histogram.counters[counter].metricVec);
            });

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for single label');
                t.equals(str, expected, 'single label');
            });
            cb();
        },

        function (_, cb) {
            // Histogram metric with labels inherited from Collector
            collector = mod_artedi.createCollector({
                labels: {
                    service: 'muskie'
                }
            });

            histogram = collector.histogram({
                name: 'http_request_latency',
                help: 'latency of requests'
            });

            histogram.observe(99);
            expected = '' +
                '# HELP http_request_latency latency of requests\n' +
                '# TYPE http_request_latency ' + common.HISTOGRAM + '\n' +
                'http_request_latency{service="muskie",le="81"} 0 0\n' +
                'http_request_latency{service="muskie",le="243"} 1 0\n' +
                'http_request_latency{service="muskie",le="405"} 1 0\n' +
                'http_request_latency{service="muskie",le="567"} 1 0\n' +
                'http_request_latency{service="muskie",le="729"} 1 0\n' +
                'http_request_latency{le="+Inf",service="muskie"} 1 0\n' +
                'http_request_latency_count{service="muskie"} 1 0\n' +
                'http_request_latency_sum{service="muskie"} 99 0\n';

            resetTimestamps(histogram.gauge.metricVec);
            Object.keys(histogram.counters).forEach(function (counter) {
                resetTimestamps(histogram.counters[counter].metricVec);
            });

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for collector labels');
                t.equals(str, expected, 'Collector labels and no Histogram' +
                    ' labels');
            });
            cb();
        },

        function (_, cb) {
            // Histogram metric with labels inherited from both Collector and
            // Histogram.
            collector = mod_artedi.createCollector({
                labels: {
                    service: 'muskie'
                }
            });

            histogram = collector.histogram({
                name: 'web_conn_alive_time',
                help: 'connection alive time',
                labels: {
                    component: 'qball'
                }
            });

            histogram.observe(101);
            /* BEGIN JSSTYLED */
            /* eslint-disable */
            expected = '' +
            '# HELP web_conn_alive_time connection alive time\n' +
            '# TYPE web_conn_alive_time ' + common.HISTOGRAM + '\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="81"} 0 0\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="243"} 1 0\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="405"} 1 0\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="567"} 1 0\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="729"} 1 0\n' +
            'web_conn_alive_time{le="+Inf",service="muskie",component="qball"} 1 0\n' +
            'web_conn_alive_time_count{service="muskie",component="qball"} 1 0\n' +
            'web_conn_alive_time_sum{service="muskie",component="qball"} 101 0\n';
            /* eslint-enable */
            /* END JSSTYLED */

            resetTimestamps(histogram.gauge.metricVec);
            Object.keys(histogram.counters).forEach(function (counter) {
                resetTimestamps(histogram.counters[counter].metricVec);
            });
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for inherited labels');
                t.equals(str, expected, 'inherited Histogram and Collector' +
                    ' labels');
            });


            cb();
        },

        function (_, cb) {
            // Histogram metric with labels inherited from both Collector and
            // Histogram, and provided at time of observation.
            collector = mod_artedi.createCollector({
                labels: {
                    service: 'muskie'
                }
            });

            histogram = collector.histogram({
                name: 'webapi_conn_alive_time',
                help: 'connection alive time',
                labels: {
                    component: 'cueball'
                }
            });

            histogram.observe(101, {
                err: 'ECONNRESET'
            });

            // Silence line length linting error.
            /* BEGIN JSSTYLED */
            /* eslint-disable */
            var expected4 = '' +
            '# HELP webapi_conn_alive_time connection alive time\n' +
            '# TYPE webapi_conn_alive_time ' + common.HISTOGRAM + '\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="81"} 0 0\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="243"} 1 0\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="405"} 1 0\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="567"} 1 0\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="729"} 1 0\n' +
            'webapi_conn_alive_time{le="+Inf",err="ECONNRESET",service="muskie",component="cueball"} 1 0\n' +
            'webapi_conn_alive_time_count{err="ECONNRESET",service="muskie",component="cueball"} 1 0\n' +
            'webapi_conn_alive_time_sum{err="ECONNRESET",service="muskie",component="cueball"} 101 0\n';
            /* eslint-enable */
            /* END JSSTYLED */

            resetTimestamps(histogram.gauge.metricVec);
            Object.keys(histogram.counters).forEach(function (counter) {
                resetTimestamps(histogram.counters[counter].metricVec);
            });
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for dynamic and static labels');
                t.equals(str, expected4, 'dynamic labels, and static labels' +
                    ' from Histogram and Collector');
            });
            cb();
        },

        function (_, cb) {
            collector = mod_artedi.createCollector();
            histogram = collector.histogram({
                name: 'test_test1',
                help: 'testhelp'
            });

            histogram.observe(1);
            histogram.observe(100);
            resetTimestamps(histogram.gauge.metricVec);
            Object.keys(histogram.counters).forEach(function (counter) {
                resetTimestamps(histogram.counters[counter].metricVec);
            });
            // TODO We should have the +Inf label at the end. This works, but
            // it would look nicer.
            expected = '' +
                '# HELP test_test1 testhelp\n' +
                '# TYPE test_test1 ' + common.HISTOGRAM + '\n' +
                'test_test1{le="1"} 1 0\n' +
                'test_test1{le="3"} 1 0\n' +
                'test_test1{le="5"} 1 0\n' +
                'test_test1{le="7"} 1 0\n' +
                'test_test1{le="9"} 1 0\n' +
                'test_test1{le="+Inf"} 2 0\n' +
                'test_test1{le="81"} 1 0\n' +
                'test_test1{le="243"} 2 0\n' +
                'test_test1{le="405"} 2 0\n' +
                'test_test1{le="567"} 2 0\n' +
                'test_test1{le="729"} 2 0\n' +
                'test_test1_count{} 2 0\n' +
                'test_test1_sum{} 101 0\n';
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for copying bucket values');
                t.equals(str, expected, 'initial values copied from ' +
                    'low-order buckets to high-order buckets');
            });

            cb();
        }]
    }, function (_, result) {
        t.end();
    });
});

mod_tape('odd value tests', function (t) {
    var collector = mod_artedi.createCollector();
    var counter = collector.counter({
        name: 'counter',
        help: 'help'
    });
    var hist = collector.histogram({
        name: 'histo',
        help: 'histo help'
    });

    counter.add(0);
    t.equals(counter.metricVec.getDefault().value, 0, 'add zero to counter');

    hist.observe(0);
    t.equals(hist.defaultCounter().metricVec.getDefault().value, 0,
        'histogram observes zero value');

    t.throws(function () {
        counter = collector.counter({
            name: '@#$5235',
            help: 'valid help @ #34'
        });
    }, 'invalid collector name (invalid chars)');

    t.throws(function () {
        counter = collector.counter({
            name: 'space name',
            help: 'valid help @ #34'
        });
    }, 'invalid collector name (space)');

    t.throws(function () {
        counter = collector.counter({
            name: 'valid_name',
            help: 4
        });
    }, 'invalid collector help (numeric)');

    t.throws(function () {
        counter = collector.counter({
            name: 'valid_name',
            help: { help: 'nested help!' }
        });
    }, 'invalid collector help (object)');

    t.end();
});

function resetTimestamps(metricVec) {
    Object.keys(metricVec.metrics).forEach(function (metric) {
        metricVec.metrics[metric].timestamp = 0;
    });
}
