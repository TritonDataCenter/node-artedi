# node-artedi: client library for metric collection

## About
`artedi` is a Node.js library for measuring applications -- specifically, the
services composing Triton and Manta.

## Sample Usage
Here is a simple example usage of counters and histograms to expose
metrics in the Prometheus v0.0.4 text format.

```javascript
var artedi = require('artedi');

// collectors are the 'parent' collector.
var collector = artedi.createCollector();

// counters are a 'child' collector.
// This call is idempotent.
var counter = collector.counter({
    name: 'http_requests_completed',
    help: 'count of muskie http requests completed',
    labels: {
        zone: 'e5d3'
    }
});

// Add 1 to the counter with the labels 'method=getobject,code=200'.
counter.increment({
    method: 'getobject',
    code: '200'
});

collector.collect(artedi.FMT_PROM, function (err, metrics) {
    console.log(metrics);
    // Prints:
    // # HELP http_requests_completed count of muskie http requests completed
    // # TYPE http_requests_completed counter
    // http_requests_completed{zone="e5d3",method="getobject",code="200"} 1
});

var histogram = collector.histogram({
    name: 'http_request_latency_seconds',
    help: 'latency of muskie http requests',
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// Observe a latency of 998ms for a 'putobjectdir' request.
histogram.observe(0.998, {
    method: 'putobjectdir'
});

// For each bucket, we get a count of the number of requests that fall
// below or at the latency upper-bound of the bucket.
// This output is defined by Prometheus.
collector.collect(artedi.FMT_PROM, function (err, metrics) {
    if (err) {
        throw new Error('could not collect metrics');
    }
    console.log(metrics);
    // Prints:
    // # HELP http_requests_completed count of muskie http requests completed
    // # TYPE http_requests_completed counter
    // http_requests_completed{method="getobject",code="200",zone="e5d3"} 1
    // # HELP http_request_latency_seconds latency of muskie http requests
    // # TYPE http_request_latency_seconds histogram
    // http_request_latency_seconds{method="putobjectdir",le="0.005"} 0
    // http_request_latency_seconds{method="putobjectdir",le="0.01"} 0
    // http_request_latency_seconds{method="putobjectdir",le="0.025"} 0
    // http_request_latency_seconds{method="putobjectdir",le="0.05"} 0
    // http_request_latency_seconds{method="putobjectdir",le="0.01"} 0
    // http_request_latency_seconds{method="putobjectdir",le="0.25"} 0
    // http_request_latency_seconds{method="putobjectdir",le="0.5"} 0
    // http_request_latency_seconds{method="putobjectdir",le="1"} 1
    // http_request_latency_seconds{method="putobjectdir",le="2.5"} 1
    // http_request_latency_seconds{method="putobjectdir",le="5"} 1
    // http_request_latency_seconds{method="putobjectdir",le="10"} 1
    // http_request_latency_seconds{le="+Inf",method="putobjectdir"} 1
    // http_request_latency_seconds_count{method="putobjectdir"} 1
    // http_request_latency_seconds_sum{method="putobjectdir"} 0.998
});
```

For more advanced usage and full API documentation, see
[docs/API.md](./docs/API.md).

## Installation
```
npm install artedi
```

## DTrace probes
artedi includes some useful DTrace probes. The full listing of probes and their
arguments can be found in the [lib/provider.js](./lib/provider.js) file.

In this first example artedi is observing the latency of queries to three
Postgres instances (using [TritonDataCenter/pgstatsmon](https://github.com/TritonDataCenter/pgstatsmon)).
The latency observations include the name of the backend Postgres instance.

We can create a graph of each Postgres backend's latency using built-in DTrace
aggregation:
```
$ dtrace -qn 'artedi*:::histogram-observe {@lat[json(copyinstr(arg2), "name")] = quantize(arg1);} tick-10s {printa(@lat);}'

  3.postgres.walleye.kkantor.com-87eb177c
           value  ------------- Distribution ------------- count
               8 |                                         0
              16 |@@@@@@@@@@                               5
              32 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@            15
              64 |@@                                       1
             128 |                                         0

  2.postgres.walleye.kkantor.com-335c1a83
           value  ------------- Distribution ------------- count
               8 |                                         0
              16 |@@@@@@@@                                 4
              32 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           16
              64 |@@                                       1
             128 |                                         0

  1.postgres.walleye.kkantor.com-f5c49b33
           value  ------------- Distribution ------------- count
               8 |                                         0
              16 |@@@@@@@@                                 4
              32 |@@@@@@@@@@@@@@@@@@@@@@@@@@@              14
              64 |@@@@@@                                   3
             128 |                                         0
^C
```

We could also retrieve the number of HTTP operations performed by HTTP handler
name and return code (from manta-muskie):
```
$ dtrace -qn 'artedi*:::counter-add /copyinstr(arg0) == "http_requests_completed" /{ jsonstr = copyinstr(arg2); @counts[json(jsonstr, "operation"), json(jsonstr, "statusCode")] = count(); }'
^C

  getstorage    200     135
  putobject     204     137
```

These probes could conceivably be used to create more complicated reporting
tools as well.

## License

MPL-v2
