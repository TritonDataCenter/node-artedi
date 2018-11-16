/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2018, Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_vasync = require('vasync');
var mod_jsprim = require('jsprim');
var mod_verror = require('verror');
var VError = require('verror').VError;
var MultiError = require('verror').MultiError;

var lib_utils = require('./utils');
var lib_buckets = require('./buckets');
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
 *
 * The Collector object also keeps track of a list of trigger functions. These
 * trigger functions will be kicked off when the collect() function is called.
 * For more information, see Collector.collect() and
 * Collector.processTriggers().
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

    /*
     * Indicates this version uses fixed buckets per node-artedi#17 instead of
     * the previous versions that supported dynamic buckets. We add this to the
     * collector so that things like node-fast can support both node-artedi v1
     * and node-artedi v2 by checking whether this is true on an otherwise
     * unknown `collector` object.
     */
    this.FIXED_BUCKETS = true;

    this.registry = {};
    this.triggerRegistry = [];
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
 * This function pulls together the metrics that have been collected by each
 * of the child collectors.
 *
 * First, we kick off all of the registered metric triggers. Those are expected
 * to modify a number of metrics.
 *
 * Next, we will tell each collector that is a child of this Collector to
 * produce machine-readable output that we can report back to whatever is
 * scraping this process.
 *
 * For example, if this collector has two child collectors (a Counter and
 * a Histogram), this instructs both to produce Prometheus-style output and
 * returns it to the caller.
 */
Collector.prototype.collect = function collect(format, cb) {
    mod_assert.string(format, 'format');
    mod_assert.func(cb, 'cb');

    /*
     * First, process trigger functions.
     * Second, serialize the metrics.
     */
    mod_vasync.pipeline({
        'funcs': [
            processTriggers,
            processCollectors
        ],
        'arg': {'collector': this, 'format': format}
    }, function (err, result) {
        if (err) {
            cb(err, null);
            return;
        }
        /*
         * result.operations[1].result is the result of the processCollectors()
         * call.
         */
        cb(null, result.operations[1].result);
    });
};

/*
 * Adds the given trigger function to the trigger registry. A function added
 * through this API will be called when metrics are scraped from this collector.
 *
 * Functions passed in must take a callback, and returns an error (if one
 * occurs) through the callback function.
 */
Collector.prototype.addTriggerFunction = function addTriggerFunction(func) {
    mod_assert.func(func, 'func');
    this.triggerRegistry.push(func);
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
 * Iterate through the registry of child collectors and kick off the
 * serialization tasks for the given serialization format.
 */
function processCollectors(opts, cb) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.collector, 'opts.collector');
    mod_assert.string(opts.format, 'opts.format');

    var str = '';
    var errors = [];
    var queue;
    var multiError = null;
    var dispatch, promCallback;

    // The collector object and serialization format are passed in as arguments.
    var collector = opts.collector;
    var format = opts.format;

    if (format === FMT_PROM) {

        // When metrics are done being serialized, append them to the cumulative
        // reporting string.
        promCallback = function collectDone(err, metricString) {
            mod_assert.string(metricString, 'metricString');
            if (err) {
                errors.push(err);
            }
            str += metricString;
        };
        // Instruct each collector to serialize their metrics.
        dispatch = function dispatchCollect(coll, callback) {
            coll.prometheus(callback);
        };

        // Add each child collector to the serialization queue.
        queue = mod_vasync.queue(dispatch, 10);
        mod_jsprim.forEachKey(collector.registry, function (_, coll) {
            queue.push(coll, promCallback);
        });
        queue.close();
        queue.once('end', function () {
            if (errors.length > 0) {
                multiError = new MultiError(errors);
            }
            cb(multiError, str);
        });


    } else {
        cb(new VError('Unknown serialization format: ' + format), null);
        return;
    }
}

/*
 * Go through the trigger registry and kick off any triggers that the user may
 * have specified. If the user didn't specify any triggers this function just
 * creates and closes an empty vasync queue.
 *
 * We allow a maximum of five concurrent triggers.
 */
function processTriggers(opts, cb) {
    mod_assert.object(opts, 'opts');
    mod_assert.object(opts.collector, 'opts.collector');

    var triggerCallback, dispatch;
    var triggerQueue;
    var triggerErrors = [];

    var collector = opts.collector;

    // Kick off each trigger.
    dispatch = function dispatchTrigger(trigger, callback) {
        trigger(collector, callback);
    };

    // Allow up to five concurrent triggers.
    triggerQueue = mod_vasync.queue(dispatch, 5);

    // When a trigger ends, retain errors (if any).
    triggerCallback = function triggerDone(err) {
        if (err) {
            triggerErrors.push(err);
        }
    };

    // Add all of the triggers from the registry to the queue.
    triggerQueue.push(collector.triggerRegistry, triggerCallback);
    triggerQueue.close();

    triggerQueue.once('end', function () {
        cb(mod_verror.errorFromList(triggerErrors));
        return;
    });
}

module.exports = {
    createCollector: function createCollector(options) {
        return (new Collector(options));
    },
    exponentialBuckets: lib_buckets.exponentialBuckets,
    FMT_PROM: FMT_PROM,
    FMT_PROM_0_0_4: FMT_PROM_0_0_4,
    linearBuckets: lib_buckets.linearBuckets,
    logLinearBuckets: lib_buckets.logLinearBuckets
};
