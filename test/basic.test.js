/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */

var mod_tape = require('tape');
var mod_vasync = require('vasync');

var mod_artedi = require('..');

var common = require('../lib/common.js');

var VError = require('verror').VError;

/*
 * Make sure we can get raw values.
 */
mod_tape('getValue tests', function (t) {
    var collector = mod_artedi.createCollector();
    var counter = collector.counter({
        name: 'test',
        help: 'test'
    });
    t.equals(counter.getValue(), 0, 'default counter should start at zero');

    counter = collector.counter({
        name: 'better_test',
        help: 'test',
        labels: {
            'something': 'important'
        }
    });
    counter.increment();
    t.equals(counter.getValue(), 1, 'default counter should be incremented');
    t.ok(counter.getValue({'something': 'important'}, 'search works with' +
            ' inherited labels'));

    counter = collector.counter({
        name: 'best_test',
        help: 'test'
    });
    counter.increment({
        'statusCode': 204
    });
    t.equals(counter.getValue({'statusCode': 204}), 1, 'child label get value');

    var gauge = collector.gauge({
        name: 'my_gauge',
        help: 'just an ordinary gauge'
    });
    gauge.set(1000);
    t.equals(gauge.getValue(), 1000, 'get value from a gauge');

    var err = gauge.getValue({name: 'noexist'});
    t.ok(err instanceof VError, 'error on nonexistent gauge');
    t.equal(err.name, common.NOEXISTERROR, 'error name checks out');

    t.end();
});


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
    t.equals(counter.getValue({mytag: 'isAwesome', global: 'label'}), 1,
        'increment w/ static labels from Collector and Counter');

    t.equals(counter.getValue(), 1, 'default counter with getValue');


    counter.increment({
        dynamicLabel: 'pepsi'
    });

    t.equals(counter.getValue({dynamicLabel: 'pepsi'}), 1,
        'increment w/ dynamic label and static labels');

    counter = collector.counter({
        name: 'counter',
        help: 'counters are fantastic'
    });

    counter.increment();
    t.equals(counter.getValue(), 1, 'increment w/ label from Collector');

    // The user gave us a label structure, but no labels.
    counter.add(100, {});
    t.equals(counter.getValue(), 101, 'increment with empty label structure');

    // Test for numeric metric values.
    counter.increment({
        method: 'putobject',
        code: 200
    });
    t.equals(counter.getValue({
        method: 'putobject',
        code: 200
    }), 1, 'numeric label values, multiple labels');

    t.end();
});

mod_tape('absolute gauge tests', function (t) {
    var collector = mod_artedi.createCollector();
    var abs_gauge = collector.gauge({
        name: 'my_abs_gauge',
        help: 'abs gauge help'
    });

    abs_gauge.set(100, {});
    t.equals(abs_gauge.getValue(), 100, 'basic absolute gauge set value');

    abs_gauge.set(0, {});
    t.equals(abs_gauge.getValue(), 0, 'basic absolute gauge set value to zero');

    abs_gauge.set(-1000.1234, {});
    t.equals(abs_gauge.getValue(), -1000.1234,
            'basic absolute gauge set value to negative float');

    t.throws(function () {
        abs_gauge.set('hello', {});
    }, 'set gauge value to a string');

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
            // Improper serialization format.
            collector.collect('INVALID_FORMAT', function (err, str) {
                t.ok(err, 'error present for invalid serialization format');
                t.notOk(str, 'no metrics returned with serialization error');
                cb();
            });
        },

        function (_, cb) {
            // No metrics present, so we should just see the comments.
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for no metrics');
                t.equals(str, expected, 'no metrics, only comments');
                cb();
            });
        },

        function (_, cb) {
            counter.increment({
                trollcon: '4',
                user: 'kkantor'
            });

            var oneDemerit = expected +
                'bot_demerits{trollcon="4",user="kkantor"} 1\n';
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for two labels');
                t.equals(str, oneDemerit, 'two label increment');
                cb();
            });
        },

        function (_, cb) {
            // Note the reversal of labels here (shouldn't make a difference).
            counter.add(1000, {
                user: 'kkantor',
                trollcon: '4'
            });

            /* BEGIN JSSTYLED */
            // eslint-disable-next-line max-len
            var lots = expected + 'bot_demerits{trollcon="4",user="kkantor"} 1001\n';
            /* END JSSTYLED */
            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for reversed labels');
                t.equals(str, lots, 'reversed label add');
                cb();
            });
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

            expected = '' +
                '# HELP test help\n' +
                '# TYPE test ' + common.COUNTER + '\n' +
                'test{} 3\n';

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for default counter');
                t.equals(str, expected, 'default counter');
                cb();
            });
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
                cb();
            });
        },

        function (_, cb) {
            histogram.observe(1, {
                'key': 'value'
            });

            expected = expected +
                'bot_trolololol{key="value",le="0.81"} 0\n'
                + 'bot_trolololol{key="value",le="1.62"} 1\n'
                + 'bot_trolololol{key="value",le="2.43"} 1\n'
                + 'bot_trolololol{key="value",le="3.24"} 1\n'
                + 'bot_trolololol{key="value",le="4.05"} 1\n'
                + 'bot_trolololol{key="value",le="4.86"} 1\n'
                + 'bot_trolololol{key="value",le="5.67"} 1\n'
                + 'bot_trolololol{key="value",le="6.48"} 1\n'
                + 'bot_trolololol{key="value",le="7.29"} 1\n'
                + 'bot_trolololol{key="value",le="8.1"} 1\n'
                + 'bot_trolololol{le="+Inf",key="value"} 1\n'
                + 'bot_trolololol_count{key="value"} 1\n'
                + 'bot_trolololol_sum{key="value"} 1\n';

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for single label');
                t.equals(str, expected, 'single label');
                cb();
            });
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
                'http_request_latency{service="muskie",le="76"} 0\n' +
                'http_request_latency{service="muskie",le="228"} 1\n' +
                'http_request_latency{service="muskie",le="380"} 1\n' +
                'http_request_latency{service="muskie",le="532"} 1\n' +
                'http_request_latency{service="muskie",le="684"} 1\n' +
                'http_request_latency{le="+Inf",service="muskie"} 1\n' +
                'http_request_latency_count{service="muskie"} 1\n' +
                'http_request_latency_sum{service="muskie"} 99\n';

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for collector labels');
                t.equals(str, expected, 'Collector labels and no Histogram' +
                    ' labels');
                cb();
            });
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
            'web_conn_alive_time{service="muskie",component="qball",le="76"} 0\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="228"} 1\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="380"} 1\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="532"} 1\n' +
            'web_conn_alive_time{service="muskie",component="qball",le="684"} 1\n' +
            'web_conn_alive_time{le="+Inf",service="muskie",component="qball"} 1\n' +
            'web_conn_alive_time_count{service="muskie",component="qball"} 1\n' +
            'web_conn_alive_time_sum{service="muskie",component="qball"} 101\n';
            /* eslint-enable */
            /* END JSSTYLED */

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for inherited labels');
                t.equals(str, expected, 'inherited Histogram and Collector' +
                    ' labels');
                cb();
            });
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
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="76"} 0\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="228"} 1\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="380"} 1\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="532"} 1\n' +
            'webapi_conn_alive_time{err="ECONNRESET",service="muskie",component="cueball",le="684"} 1\n' +
            'webapi_conn_alive_time{le="+Inf",err="ECONNRESET",service="muskie",component="cueball"} 1\n' +
            'webapi_conn_alive_time_count{err="ECONNRESET",service="muskie",component="cueball"} 1\n' +
            'webapi_conn_alive_time_sum{err="ECONNRESET",service="muskie",component="cueball"} 101\n';
            /* eslint-enable */
            /* END JSSTYLED */

            collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for dynamic and static labels');
                t.equals(str, expected4, 'dynamic labels, and static labels' +
                    ' from Histogram and Collector');
                cb();
            });
        },

        function (_, cb) {
            collector = mod_artedi.createCollector();
            histogram = collector.histogram({
                name: 'test_test1',
                help: 'testhelp'
            });

            histogram.observe(10);
            histogram.observe(100);
            // TODO We should have the +Inf label at the end. This works, but
            // it would look nicer.
            expected = '' +
                '# HELP test_test1 testhelp\n'
                + '# TYPE test_test1 ' + common.HISTOGRAM + '\n'
                + 'test_test1{le="8.1"} 0\n'
                + 'test_test1{le="25"} 1\n'
                + 'test_test1{le="42"} 1\n'
                + 'test_test1{le="59"} 1\n'
                + 'test_test1{le="76"} 1\n'
                + 'test_test1{le="+Inf"} 2\n'
                + 'test_test1{le="228"} 2\n'
                + 'test_test1{le="380"} 2\n'
                + 'test_test1{le="532"} 2\n'
                + 'test_test1{le="684"} 2\n'
                + 'test_test1_count{} 2\n'
                + 'test_test1_sum{} 110\n';

                collector.collect(mod_artedi.FMT_PROM, function (err, str) {
                t.notOk(err, 'no error for copying bucket values');
                t.equals(str, expected, 'initial values copied from ' +
                    'low-order buckets to high-order buckets');
                cb();
            });

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
    t.equals(counter.getValue(), 0, 'add zero to counter');

    hist.observe(0.0001);
    t.equals(hist.defaultCounter().getValue({'le': 0.0001}), 1,
        'histogram tracks values less than one');

    hist.observe(0);
    t.equals(hist.defaultCounter().getValue(), 0,
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

/*
 * Test basic functionality for triggers.
 *
 * This test primarily checks if a trigger function gets called.
 *
 * The previous tests will have already tested if metric serialization works
 * _without_ having specified any triggers.
 */
mod_tape('basic trigger tests', function (t) {
    var collector = mod_artedi.createCollector();
    collector.counter({
        name: 'test_counter',
        help: 'test help'
    });
    var called = false;

    collector.addTriggerFunction(function triggerTest(coll, cb) {
        t.ok(coll, 'collector object present');
        var my_counter = coll.getCollector('test_counter');
        t.ok(my_counter, 'collector object correct');
        t.equals(my_counter.name, 'test_counter', 'counter object is valid');
        called = true;
        cb();
    });

    collector.collect(mod_artedi.FMT_PROM, function (err, _) {
        t.notOk(err, 'no error from triggered metrics');
        t.ok(called, 'trigger function called');
        t.end();
    });
});

/*
 * Make sure log/linear buckets are working properly.
 */
mod_tape('log/linear bucket tests', function (t) {
    var collector = mod_artedi.createCollector();
    var histo = collector.histogram({
        name: 'test_histogram',
        help: 'test help'
    });
    var value;

    /*
     * Make sure we are copying values from lower to upper buckets properly.
     * This is a result of MORAY-447, where we saw an overlapping bucket have
     * its value doubled.
     *
     * To test the fix, we will:
     *  - Create a set of small buckets.
     *  - Create a set of large buckets.
     *    - This should copy the values from the small buckets to large buckets.
     *  - Record a value in the bucket below the smallest of the large buckets.
     *    - Previously this would result in the lower values being re-copied to
     *      the smallest of the large buckets (6561).
     *    - Now it should correctly identify that the 6561 bucket already exists
     *      meaning lower values should not be re-copied to the overlapping
     *      bucket.
     */
    histo.observe(10); // Record three small values.
    histo.observe(10);
    histo.observe(10);
    histo.observe(6157); // Record a value which will create larger buckets.
    histo.observe(4788); // Record a value below the smallest larger bucket.

    value = histo.defaultCounter().getValue({'le': 6156});
    t.equals(value, 4, 'overlapping bucket values copied correctly');


    t.end();
});
