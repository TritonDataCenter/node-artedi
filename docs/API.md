* [Intro](#intro)
* [Collector](#collector)
* [Counter](#counter)
* [Gauge](#gauge)
* [Histogram](#histogram)

## Intro
This document contains a description of this library's public-facing API.
We outline each of the different objects that can be created, and describe
the functions that can be called on each object.

For information on the private API (for developers), see
[private API docs](./private_api.md).

## Collector
A Collector is the 'parent' of all other collector types (Counter, Gauge,
Histogram). A Collector is what is first created by the user, and then the
user will create 'child' collectors from their Collector instance.

All of the labels passed to a Collector will be inherited by child collectors.

### artedi.createCollector(opts) : Collector
Create a new Collector object with the given options (labels are included in
`opts`). `opts` is optional, and may include a nested 'labels' object.

Example:
```javascript
var collector = artedi.createCollector({
    labels: {
        hostname: 'myhostname'
    }
});
```

### collector.counter(opts) : Counter
Create a new Counter object with the given options (incl. labels). This call is
idempotent. `opts` must include 'help' and 'name' fields, and may optionally
include a 'labels' object.

Example:
```javascript
var counter = collector.counter({
    name: 'http_requests_completed',
    help: 'count of http requests completed',
    labels: {
        component: 'muskie'
    }
});
```
### collector.gauge(opts) : Gauge
Creates a new Gauge object with the given options (incl. labels). This call is
idempotent. `opts` must include 'help' and 'name' fields, and may optionally
include a 'labels' object. Additionally, gauges have an expiry feature such that
the gauge is reset to a default value if the vaue is not otherwise updated for a
certain time period. The expiry behavior is controlled with three fields: an
'expires' boolean, an 'expiryPeriod' numeric value representing milliseconds,
and a 'defaultValue' numeric value representing the default value of the
gauge. IF not explicitly set to `true`, the value of `expires` defaults to
`false`. The `expiryPeriod` default is 300000 milliseconds and the default value
for `defaultValue` is `0`.

Examples:
```javascript
var gauge = collector.gauge({
    name: 'tcp_connections_available',
    help: 'count of tcp connections available',
    labels: {
        backend: 'myserver'
    }
});
```

```javascript
var gauge = collector.gauge({
    name: 'postgres_vacuum_phase',
    help: 'current phase of postgres table vacuum',
    labels: {
        database: 'mydatabase'
    },
    expires: true,
    expiryPeriod: 120000,
    defaultValue: 0
});
```
### collector.histogram(opts) : Histogram
Creates a new Histogram object with the given options (incl. labels and
buckets). This call is idempotent. `opts` must include 'help' and 'name' fields,
and may optionally include a 'labels' object and/or a buckets array.

Example:
```javascript
var histogram = collector.histogram({
    name: 'http_request_latency_seconds',
    help: 'latency of http requests',
    labels: {
        component: 'muskie'
    },
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});
```

Note: If `buckets` are not specified, the default buckets will be:

```
[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```


### collector.addTriggerFunction(func(Collector, callback))
Adds `func` to a list of triggers to call immediately before metrics are
collected during a call to `collector.collect()`.

`func` must take 'callback' and 'collector' arguments and invoke the callback to
signal the end of the trigger. The callback can be invoked with an Error
argument if an error occurs during trigger execution.

The Collector that is passed into the trigger is a handle to the Collector that
the trigger was registered with.

Example:
```javascript
function myTrigger(m_collector, cb) {
    var my_counter = m_collector.getCollector('http_requests_completed');
    my_counter.increment(); // Increment a counter.
    cb(null); // No error occurred.
}

collector.addTriggerFunction(myTrigger);
```

### collector.collect(format, callback(err, string))
Iterates through the list of previously provided trigger functions, invoking
each trigger. Triggers are invoked in parallel. After all of the trigger
functions have returned, the previously-instantiated collectors serialize their
metrics in the provided format.

If an error occurs during the execution of either triggers or collector
serialization, collection will stop and an error will be returned through the
callback.

Valid values for `format` are in the global `artedi` namespace. Currently, the
valid values are `FMT_PROM` and `FMT_PROM_0_0_4`. `FMT_PROM` will always point
to the latest supported version of the Prometheus text format. `FMT_PROM_0_0_4`
represents version 0.0.4 of the Prometheus text format, which is the latest
supported text format version.

Example:
```javascript
collector.collect(artedi.FMT_PROM, function (err, str) {
    if (err) {
        throw err;
    }
    console.log(str);
});
```

### collector.getCollector(name) : child collector
Finds a child collector with the given `name`, and returns it, if it exists. If
the collector doesn't exist, `null` is returned.

Example:
```javascript
var my_counter = collector.getCollector('http_requests_completed');
```

### collector.FIXED_BUCKETS

This is a boolean which is always `true` for node-artedi v2 and will be
`undefined` for previous versions. This allows libraries that are passed a
collector object to support both node-artedi v1 dynamic buckets and node-artedi
v2 fixed buckets (see node-artedi#17 for more details).

## Counter
Counters are the most simple of the collector types. They simply count
up starting from zero. You can either increment a counter, or add
arbitrary positive numbers to counters. The numbers do not have to be
whole numbers.

### counter.increment(labels)
Adds 1 to the metric represented by `labels` (calls `add(1, labels)`).

Example:
```javascript
counter.increment({
    method: 'ping',
    code: 200
});
```

### counter.add(value, labels)
Add `value` to the metric represented by `labels`, `value` must be > 0.

Example:
```javascript
counter.add(100, {
    operation: 'click'
});
```

### counter.getValue(labels)
Retrieve the value of the underlying metric represented by `labels`. If none
exists, an error is returned.

Example:
```javascript
counter.getValue( { operation: 'click' } );
```


## Gauge
Gauges are similar to counters. Gauges can count up, or count down relative
to their current value, or be set to an arbitrary value. Gauges start with an
initial value of `0`.

### gauge.add(value, labels)
Add `value` to the metric represented by `labels`.

Example:
```javascript
gauge.add(10, {
    le: '+Inf'
});
```

### gauge.set(value, labels)
Set the metric represented by `labels` to `value`.

Example:
```javascript
gauge.set(123, {
    tableName: 'manta'
});
```

### gauge.getValue(labels)
Retrieve the value of the underlying metric represented by `labels`. If none
exists, an error is returned.

Example:
```javascript
gauge.getValue( { tableName: 'manta' } );
```

## Histogram
Histograms are internally made up of Counters and Gauges. Once you
understand that, Histograms are much easier to understand. Histograms
count values that fall between a number of buckets.

### histogram.observe(value, labels)
Increment buckets with a value >= `value`.

Example:
```javascript
histogram.observe(1111, {
    method: 'putobject',
    code: 204
});
```

### Bucket Generators
Artedi includes several generator functions that help create `buckets` arrays
for use with histograms.

#### artedi.linearBuckets(min, width, count)
Generate `count` buckets starting with `min` with each bucket being `width`
larger than the previous.

Example:
```javascript
artedi.linearBuckets(0.5, 0.5, 10);
// returns [ 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5 ]
```

Note: The `min` parameter must be > 0. It will likely be common to use the same
value for `width` and `min` as in the example above.

#### artedi.exponentialBuckets(min, factor, count)
Generate `count` buckets starting with `min` with each bucket being `factor`
times larger than the previous.

Example:
```javascript
artedi.exponentialBuckets(1, 2, 5);
// returns [ 1, 2, 4, 8, 16 ]
```

#### artedi.logLinearBuckets(base, lowPower, highPower, bucketsPerMagnitude)
Generate a set of log-linear buckets. This will create `bucketsPerMagnitude`
buckets for the magnitude that contains `base^lowPower`, and each magnitude
up to and including the magnitude that starts with `highPower`.

Example:

```javascript
artedi.logLinearBuckets(10, -2, 1, 5);
// returns [ 0.02, 0.04, 0.06, 0.08, 0.1, 0.2, 0.4, 0.6, 0.8, 1, 2, 4, 6, 8, 10, 20, 40, 60, 80, 100 ]
```

Note in the above example, the `lowPower` was -2 so we started with 10^-2 = 0.01
and used that magnitude (10^-2 to 10^-1) as the first set of 5 buckets. Then we
created buckets for the magnitudes 10^-1 to 10^0, 10^0 to 10^1 and finally 10^1
(our `highPower` parameter) to 10^2.
