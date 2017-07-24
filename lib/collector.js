/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2017, Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_vasync = require('vasync');
var mod_jsprim = require('jsprim');
var VError = require('verror').VError;
var MultiError = require('verror').MultiError;

var lib_utils = require('./utils');
var lib_counter = require('./counter');
var lib_gauge = require('./gauge');
var lib_histogram = require('./histogram');
var lib_common = require('./common');

/*
 * Serialization formats that this library supports:
 */
var FMT_PROM_0_0_4 = 'prometheus-0.0.4';

// FMT_PROM points to the latest Prometheus format spec.
var FMT_PROM = FMT_PROM_0_0_4;

/*
 * The Collector object acts as a mostly dumb parent. It doesn't hold metrics,
 * but it does hold a list of all child metric collectors.
 *
 * When the user creates child collectors from this parent collector (by
 * calling collector.counter(), collector.gauge(), etc.), this object
 * will create a child collector and then register it.
 *
 * Registration serves two purposes:
 * 1) It gives the user the ability to call collector.collect() to retrieve
 *      parseable metrics from ALL child collectors without explicitly
 *      calling the collect() function on each child collector.
 * 2) It persists child collector objects in memory. Collectors keep all of
 *      their metrics in memory, so to avoid having collectors garbage collected
 *      we will place them in a map. When the user creates a child collector
 *      for the first time (a counter, for example), this object will invoke
 *      the constructor for that collector type to create a new collector.
 *      Now let's say that the user's program dereferences that collector. This
 *      object will hold on to the counter so when the user tries to create
 *      the same counter again (they re-entered the same function as when they
 *      first created the counter), we can simply return the counter that has
 *      already been created without having lost any important metrics.
 *
 */
function Collector(options) {
    mod_assert.optionalObject(options, 'options');
    if (options) {
        mod_assert.object(options.labels, 'options.labels');
    }
    var err;

    if (options) {
        this.staticLabels = options.labels;
        this.staticLabels = lib_utils.trim(this.staticLabels);
        err = lib_utils.checkValid(this.staticLabels);
        if (err !== null) {
            throw new VError(err, 'invalid labels');
        }
    } else {
        this.staticLabels = null;
    }

    this.registry = {};
}

/* Public Functions */

/*
 * The user calls collector.counter(options) to create a 'child' Counter
 * object from the 'parent' Collector object.
 */
Collector.prototype.counter = function counter(options) {
    return (this.createChild(options, lib_common.COUNTER));
};

/*
 * The user calls collector.gauge(options) to create a 'child' Gauge
 * object from the 'parent' Collector object.
 */
Collector.prototype.gauge = function gauge(options) {
    return (this.createChild(options, lib_common.GAUGE));
};

/*
 * The user calls collector.histogram(options) to create a 'child' Histogram
 * object from the 'parent' Collector object.
 */
Collector.prototype.histogram = function histogram(options) {
    return (this.createChild(options, lib_common.HISTOGRAM));
};

/*
 * We will tell each collector that is a child of this Collector to produce
 * machine-readable output that we can report back to whatever is scraping
 * this process.
 *
 * For example, if this collector has two child collectors (a Counter and
 * a Histogram), this instructs both to produce Prometheus-style output and
 * returns it to the caller.
 */
Collector.prototype.collect = function collect(format, cb) {
    mod_assert.string(format, 'format');
    mod_assert.func(cb, 'cb');

    var str = '';
    var errors = [];
    var queue;
    var multiError = null;

    if (format === FMT_PROM) {

        var promCallback = function promCallback(err, metricString) {
            mod_assert.string(metricString, 'metricString');
            if (err) {
                errors.push(err);
            }
            str += metricString;
        };

        var dispatchCollect = function dispatchCollect(collector, callback) {
            collector.prometheus(callback);
        };

        queue = mod_vasync.queue(dispatchCollect, 10);
        mod_jsprim.forEachKey(this.registry, function (_, collector) {
            queue.push(collector, promCallback);
        });
        queue.close();

    } else {
        errors.push(new VError('Unknown serialization format: ' + format));
        cb(multiError, str);
        return;
    }

    queue.once('end', function () {
        if (errors.length > 0) {
            multiError = new MultiError(errors);
        }
        cb(multiError, str);
    });
};



/* Private Functions */
/*
 * Creates a child collector object with the given type (counter, for example).
 *
 * The 'options' structure passed in may include labels that should be used
 * by the child. In addition, this function appends any additional labels that
 * have been defined on the parent Collector.
 *
 * - If a collector with the given name and type already exists, it is returned.
 * - If a collector with the given name, but a different type already exists,
 *   an error is thrown.
 * - If a collector with the given name and type does not exist, a new child is
 *   created and returned.
 */
Collector.prototype.createChild = function createChild(options, type) {
    mod_assert.object(options, 'options');
    mod_assert.string(options.name, 'options.name');
    mod_assert.string(options.help, 'options.help');
    mod_assert.optionalObject(options.labels, 'options.labels');
    var opts;
    var err;
    var child;

    child = this.getCollector(options.name);
    if (child === null || child === undefined) {
        opts = lib_utils.shallowClone(options);
        opts.labels = options.labels;
        err = lib_utils.checkValidCollector(opts.name, opts.help);
        if (err) {
            throw new VError(err, 'invalid collector name/help');
        }

        // Include staticLabels, which are inherited from the parent Collector.
        opts.parentLabels = this.staticLabels;

        // Create a child of the corresponding type.
        if (type === lib_common.COUNTER) {
            child = new lib_counter.Counter(opts);
        } else if (type === lib_common.GAUGE) {
            child = new lib_gauge.Gauge(opts);
        } else if (type === lib_common.HISTOGRAM) {
            child = new lib_histogram.Histogram(opts);
        } else {
            throw new VError('Unknown type: ' + type);
        }

        err = this.register(child);
        if (err) {
            throw new VError(err, 'unable to create ' + type);
        }
    } else if (child.type !== type) {
        // Prevent the user from overwriting collectors.
        throw new VError('collector with name "%s" already registered',
                options.name);
    }

    return (child);
};


/*
 * Registers the given collector in this Collector's registry. If a collector
 * already exists with the given name, and error is returned.
 */
Collector.prototype.register = function register(collector) {
    mod_assert.object(collector, 'collector');
    mod_assert.string(collector.name, 'collector.name');

    if (this.getCollector(collector.name) !== null) {
        return new VError('collector with name already registered: %s',
                collector.name);
    }
    this.registry[collector.name] = collector;
    return (null);
};

/*
 * Finds finds the named collector in the registry and returns it. If none
 * exists, returns 'null.'
 */
Collector.prototype.getCollector = function getCollector(name) {
    if (!mod_jsprim.hasKey(this.registry, name)) {
        return (null);
    }
    return (this.registry[name]);
};

module.exports = {
    createCollector: function createCollector(options) {
        return (new Collector(options));
    },
    FMT_PROM: FMT_PROM,
    FMT_PROM_0_0_4: FMT_PROM_0_0_4
};
