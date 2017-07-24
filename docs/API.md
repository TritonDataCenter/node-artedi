* [Intro](#intro)
* [Collector](#collector)
* [Counter](#counter)
* [Gauge](#gauge)
* [Absolute Gauge](#absolutegauge)
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
Create a new Gauge object with the given options (incl. labels). This call is
idempotent. `opts` must include 'help' and 'name' fields, and may optionally
include a 'labels' object.

Example:
```javascript
var gauge = collector.gauge({
    name: 'tcp_connections_available',
    help: 'count of tcp connections available',
    labels: {
        backend: 'myserver'
    }
});
```

### collector.histogram(opts) : Histogram
Creates a new Histogram object with the given options (incl. labels). This call
is idempotent. `opts` must include 'help' and 'name' fields, and may optionally
include a 'labels' object.

Example:
```javascript
var histogram = collector.histogram({
    name: 'http_request_latency_ms',
    help: 'latency of http requests',
    labels: {
        component: 'muskie'
    }
});
```

### collector.collect(format, callback(err, string))
Iterate through the list of previously-instantiated collectors, calling the
serialization function corresponding to `format` on each collector.

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

## Gauge
Gauges are similar to counters. Gauges can count up, or count down relative
to their current value. Gauges start with an initial value of `0`. If you want
a gauge that can be set to arbitrary values, look at [AbsoluteGauge](#absolutegauge).

### gauge.add(value, labels)
Add `value` to the metric represented by `labels`.

Example:
```javascript
gauge.add(10, {
    le: '+Inf'
});
```

## AbsoluteGauge
AbsoluteGauges are metrics that can only be set to an arbitrary value. These are
useful for tracking things like the current amount of memory available on a
system, or the async lag of a postgres peer. If you need to 'move' a gauge
relative to its current position, you probably want to use [Gauge](#gauge)
instead.

### absoluteGauge.set(value, labels)
Set the metric represented by `labels` to `value`.

The `AbsoluteGauge` object has not yet been implemented. `AbsoluteGauge` is
going to be implemented in one of the first post-1.0 releases.

Example:
```javascript
absoluteGauge.set(123, {
    tableName: 'manta'
});
```

## Histogram
Histograms are internally made up of Counters and Gauges. Once you
understand that, Histograms are much easier to understand. Histograms
count values that fall between a number of buckets.

### histogram.observe(value, labels)
Increment buckets with a value >= `value`.

Note that it isn't necessary to specify which
buckets to use. Log/linear buckets are automatically generated. More details
about log/linear buckets can be found at the
[DTrace blog](http://dtrace.org/blogs/bmc/2011/02/08/llquantize/).

Example:
```javascript
histogram.observe(1111, {
    method: 'putobject',
    code: 204
});
```
