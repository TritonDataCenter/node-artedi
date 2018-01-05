* [Intro](#intro)
* [Internal Structures](#internal-structures)
    * [Metric](#metric)
    * [MetricVector](#metricvector)
* [External Structures](#external-structures)
    * [Collector](#collector)
    * [Counter](#counter)
    * [Gauge](#gauge)
    * [Histogram](#histogram)

## Intro
This document contains a description of this library's internal API. Consumers
of the `artedi` library shouldn't need to look at this.

Unless stated otherwise, all of the variables and functions outlined in this
document should be considered private, and not used by the library consumers.
The internal API is not static, and may change at any time without notice.

To learn about the public, user-facing API provided, see [API.md](./API.md).

## Internal Structures
These structures are internal to `artedi`, and should not be directly
instantiated by the user.

### Metric
A Metric is the most basic structure that we have implemented. Every
collector type uses Metrics, but not directly.

The Metric class represents the value behind an individual metric. For example,
a Metric could represent the count of HTTP POST requests made that resulted in a
204 status code. This class has no knowledge of higher-level concepts like
counters, gauges, or histograms. It is simply a class that maintains a numeric
value, a timestamp, and associated labels.

| Variable | Type | Value |
|----------|------|-----------------|
|labels    |object|A map of label key/value pairs|
|value     |number|A number that describes the current value of the metric|
|timestamp |number|ISO 8601 timestamp, representing the time this metric was last modified|

| Function | Arguments | Result | Return Value|
|----------|-----------|--------|-------------|
|add       |num     |Adds `num` to the `value` field of the metric. No positive/negative check is done on `num`|None|
|getValue  |None   |Returns the local `value` field. Consumed by higher level functions |`number` type|

The `labels` that belong to each Metric are key/value pairs. There can
be two Metrics that have the exact same key/value pairs, but they cannot
belong to the same collector. For example, a Counter and a Gauge may
both have the labels `{method="getObject",code="200"}`. The Gauge and
Counter will be tracking different things though. In this case, the
Counter may be tracking requests completed, while the Gauge is tracking
request latency.

All collector functions (`add()`, `observe()`, etc.) are
all built on top of the Metric's `add()` function. To
accomplish subtraction, `add()` is called with a negative number.

The user should never directly perform operations on Metrics, but
instead use collectors (which build on top of Metrics by way of
MetricVectors).

### MetricVector
MetricVectors are built on top of Metrics and give them much more
utility. Counters and Gauges directly use MetricVectors. Histograms use
MetricVectors, but indirectly.

The MetricVector provides a way to organize, create, and retrieve Metric
objects. While a Metric represents a single data point, a MetricVector can
represent one or more data points. For example, a MetricVector could represent
the counts of all HTTP requests separated by method, and response code. Each
unique method and response code pair would result in a new Metric object being
created and tracked. The MetricVector class has no knowledge of higher-level
concepts like counters, gauges, or histograms. Counters, gauges, and histograms
are built on top of MetricVectors.

| Variable | Type | Value |
|----------|------|-----------------|
|fullName  |string|full name of what is being tracked, resulting from concatenation of namespace, subsystem, and collector name|
|metrics   |object|key/value mapping. Each key corresponds to a unique Metric object|

| Function | Arguments | Result | Return Value|
|----------|-----------|--------|-------------|
|getWithLabels|object  |searches metrics map for Metrics with the provided labels|a Metric object, or null if not found|
|createWithLabels|object|creates a new Metric with the given labels, adds it to the metric map|the newly created Metric object|
|createOrGetWithLabels|object|calls `getWithLabels()` to determine if a Metric with the given labels is already created. If so, returns it. Otherwise, calls `createWithLabels()` and returns the created Metric|Metric object|
|prometheus|callback|iterates through the metric map, serializing each Metric into a prometheus-parseable string|None (string and error via callback)|
|json      |callback|same as `prometheus()`, but in JSON format|None (string and error via callback)|

Simply put, MetricVectors keep track of multiple Metrics. Counters and
Gauges directly wrap MetricVectors (which we'll explain later).
Histograms use Counters and Gauges in their implementation, so they also
use MetricVectors. MetricVectors do the vast majority of the heavy
lifting for collectors.

`json()` will be implemented when the need arises. No implementation is
currently required.

Users should not directly interact with MetricVectors. They should use
things like collectors, which use MetricVectors internally.

## External Structures
These structures are what the user will interact with. See [API.md](./API.md)
for more information on publicly available functions. This section extends
API.md by describing the private functions, as well as 'class variables'.

### Collector
| Variable | Type | Value |
|----------|------|-----------------|
|registry  | object | key/value mapping of unique collector names -> child collectors|
|triggerRegistry | array | Array of trigger functions |

`registry` keeps references to all of the previously-instantiated child
collectors. When it is time to serialize metrics, the Collector iterates through
this map and calls the serialization method of choice on each child collector.
The results are concatenated and returned to the user.

`triggerRegistry` keeps references to functions that will be invoked before
metrics are collected. See collector.processTriggers() for more information.

| Function | Arguments | Result | Return Value|
|----------|-----------|--------|-------------|
|Collector | opts      | see `createCollector()`| see `createCollector()`|
|register  |collector object|if the given collector has already been registered, returns an error. Otherwise, adds the collector to `registry`|error, or null|
|processTriggers | array, callback | Iterates through triggers in the triggerRegistry, calling each function |
|processCollectors | array, callback | Iterates through child collectors in the registry, calling a serialization function on each|

`Collector()` is called by the public `createCollector` function.

### Counter
| Variable | Type | Value |
|----------|------|-----------------|
|name|string|full name of what is being tracked, resulting from concatenation of namespace, subsystem, and collector name|
|help|string|user-provided string explaining this collector|
|metricVec|MetricVector|empty to start, is populated as the user performs metric operations|
|type|string|'counter,' used during serialization|
|staticLabels|object|key/value mapping of labels that will be present in all metrics collected by this collector|

| Function | Arguments | Result | Return Value|
|----------|-----------|--------|-------------|
|Counter |parent, opts|creates a Counter object from traits available in the parent, and options passed in|a new Counter object|
|labels|object|returns a metric that has *exactly* the label key/value pairs provided. If none exists, one is created|A Metric object|
|getWithLabels|object|same as `labels()`, but returns `null` if a metric doesn't exist|A Metric object or null|
|prometheus|callback   |returns all of the Counter's metrics in prometheus format as a string|None (string and error via callback)|

`Counter()` is called by the Collector object's `counter()` function.

### Gauge
| Variable | Type | Value |
|----------|------|-----------------|
|name|string|full name of what is being tracked, resulting from concatenation of namespace, subsystem, and collector name|
|help|string|user-provided string explaining this collector|
|metricVec|MetricVector|empty to start, is populated as the user performs metric operations|
|type|string|'gauge,' used during serialization|
|staticLabels|object|key/value mapping of labels that will be present in all metrics collected by this collector|

| Function | Arguments | Result | Return Value|
|----------|-----------|--------|-------------|
|Gauge |parent, opts|creates a Gauge object from traits available in the parent, and options passed in|a new Gauge object|
|labels|object|returns a metric that has *exactly* the label key/value pairs provided. If none exists, one is created|A Metric object|
|getWithLabels|object|same as `labels()`, but returns `null` if a metric doesn't exist|A Metric object or null|
|prometheus|callback   |returns all of the Gauge's metrics in prometheus format as a string|None (string and error via callback)|

`Gauge()` is called by the Collector object's `gauge()` function.

### Histogram
| Variable | Type | Value |
|----------|------|-----------------|
|fullName|string|full name of what is being tracked, resulting from concatenation of namespace, subsystem, and collector name|
|name|string|name of the collector, used when creating Counters and Gauges|
|buckets|number array|an array that holds the upper values of each bucket|
|counters|object|key/value mapping containing Counters for tracking metrics in each bucket|
|gauge|Gauge|a Gauge used to track the \_sum field of each metric|
|help|string|user-provided string explaining this collector|
|metricVec|MetricVector|empty to start, is populated as the user performs metric operations|
|type|string|'histogram,' used during serialization|
|staticLabels|object|key/value mapping of labels that will be present in all metrics collected by this collector|

| Function | Arguments | Result | Return Value|
|----------|-----------|--------|-------------|
|Histogram|parent, opts|creates a Histogram object from traits available in the parent, and options passed in|a new Histogram object|
|labels|object|checks if a Counter with the given labels already exists. If yes, returns it, otherwise creates a new Counter, and initializes another Gauge|None|
|prometheus|callback|iterates through the Counters, calling `prometheus()` on their `MetricVector` object. The results are stitched together and added to the result of calling `prometheus()` on the Gauge's MetricVector|None (string and error via callback)|

`Histogram()` is called by the parent object's `histogram()` function.
Buckets will be created using the log/linear method, similar to how it's done in
[DTrace](http://dtrace.org/blogs/bmc/2011/02/08/llquantize/).
