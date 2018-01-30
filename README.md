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
    help: 'latency of muskie http requests'
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
    // http_requests_completed{zone="e5d3",method="getobject",code="200"} 1
    // # HELP http_request_latency_ms latency of muskie http requests
    // # TYPE http_request_latency_ms histogram
    // http_request_latency_ms{zone="e5d3",method="getobject",code="200",le="729"} 0
    // http_request_latency_ms{zone="e5d3",method="getobject",code="200",le="2187"} 1
    // http_request_latency_ms{zone="e5d3",method="getobject",code="200",le="3645"} 1
    // http_request_latency_ms{zone="e5d3",method="getobject",code="200",le="5103"} 1
    // http_request_latency_ms{zone="e5d3",method="getobject",code="200",le="6561"} 1
    // http_request_latency_ms{zone="e5d3",method="getobject",code="200",le="+Inf"} 1
    // http_request_latency_ms_count{zone="e5d3",method="getobject",code="200"} 1
    // http_request_latency_ms_sum{zone="e5d3",method="getobject",code="200"} 998
});
```

For more advanced usage and full API documentation, see
[docs/API.md](./docs/API.md).

## Installation
```
npm install artedi
```

## License
MPL-v2

## Contributing
Contributions should be made via the [Joyent Gerrit](https://cr.joyent.us).
