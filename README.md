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
    name: 'http_request_latency_ms',
    help: 'latency of muskie http requests',
    // Use buckets that match what we would get if we used the recommended
    // http_request_latency_seconds.
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
});

// Observe a latency of 998ms for a 'putobjectdir' request.
histogram.observe(998, {
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
    // # HELP http_request_latency_ms latency of muskie http requests
    // # TYPE http_request_latency_ms histogram
    // http_request_latency_ms{method="putobjectdir",le="5"} 0
    // http_request_latency_ms{method="putobjectdir",le="10"} 0
    // http_request_latency_ms{method="putobjectdir",le="25"} 0
    // http_request_latency_ms{method="putobjectdir",le="50"} 0
    // http_request_latency_ms{method="putobjectdir",le="100"} 0
    // http_request_latency_ms{method="putobjectdir",le="250"} 0
    // http_request_latency_ms{method="putobjectdir",le="500"} 0
    // http_request_latency_ms{method="putobjectdir",le="1000"} 1
    // http_request_latency_ms{method="putobjectdir",le="2500"} 1
    // http_request_latency_ms{method="putobjectdir",le="5000"} 1
    // http_request_latency_ms{method="putobjectdir",le="10000"} 1
    // http_request_latency_ms{le="+Inf",method="putobjectdir"} 1
    // http_request_latency_ms_count{method="putobjectdir"} 1
    // http_request_latency_ms_sum{method="putobjectdir"} 998
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
Postgres instances (using joyent/pgstatsmon). The latency observations include
the name of the backend Postgres instance.

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

## Contributing
Contributions should be made via the [Joyent Gerrit](https://cr.joyent.us).
