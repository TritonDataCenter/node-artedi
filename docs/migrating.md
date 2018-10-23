# Migrating from node-artedi v1.x to v2.x

## Overview

[node-artedi](https://github.com/joyent/node-artedi) version 2.0.0 is backward
incompatible with version 1.x if you use histograms. If you do not use any
histograms in your existing code, updating to version 2 will require no changes
to your code.

If you do use histograms, this document intends to help make the update a bit
easier by explaining what you need to do in order to update.

## Very brief description of the problems

I recommend reading [the detailed description of the histogram
problems in node-artedi#17](node-artedi#17) to get a full understanding of the
problems fixed in version 2.x. This section will only give high level details.

The problems with version 1.x surround the way buckets were generated for
histograms. This was done such that the buckets available depended on the data
instead of being defined in the code. This means that different combinations of
labels for the same histogram would end up with different buckets. When this
happens, using the histogram with `histogram_quantile` will lead to incorrect
results.

It is possible to get lucky and for the results to look somewhat reasonable. But
unless the buckets for all the different combinations of labels being included
in the `histogram_quantile` query are exactly the same, there will always be
some amount of inaccuracy introduced.

## What does this mean for your code?

With version 2, you must now specify your buckets when creating a histogram and
these will be the same regardless of other labels. This means that if you have
existing code that looks like:

```
collector.histogram({
    name: 'http_request_duration_seconds',
    help: 'total time to process requests'
});
```

in version 1.x this would have generated different buckets depending on what the
input data looked like. The buckets could have ranged anywhere from 0.0001 to
3,271,550,796. With version 2, if you use that same code you will end up with
exactly the buckets:

```
[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```

which are roughly log-linear, but omit a few buckets. These do however match the
buckets used by the official prometheus client.

As part of upgrading, you'll need to choose whether to switch to the new default
buckets or, if not, which buckets you'd like to use. One way to get some useful
data on this, is to look at your existing Prometheus data created by
node-artedi version 1.x and run a query like:

```
sum(http_request_duration_seconds{service="cnapi"}) by (le)
```

for the service you're upgrading. In this case with my test setup my cnapi
service was using buckets (reformatted and sorted):

```
[
    0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.0006, 0.0007, 0.0008, 0.0009,
    0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009,
    0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09,
    0.18, 0.27, 0.36, 0.45, 0.54, 0.63, 0.72, 0.81,
    1.62, 2.43, 3.24, 4.05, 4.86, 5.67, 6.48, 7.29, 8.1,
    684, 2052, 3420, 4788, 6156,
    +Inf
]
```

the `+Inf` bucket is automatically added and should not be included in the
buckets array passed to `collector.histogram`. So in this case if I wanted, I
could change the histogram creation call to:

```
collector.histogram({
    name: 'http_request_duration_seconds',
    help: 'total time to process requests',
    buckets: [
        0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.0006, 0.0007, 0.0008, 0.0009,
        0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009,
        0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09,
        0.18, 0.27, 0.36, 0.45, 0.54, 0.63, 0.72, 0.81,
        1.62, 2.43, 3.24, 4.05, 4.86, 5.67, 6.48, 7.29, 8.1,
        684, 2052, 3420, 4788, 6156
    ]
});
```

and have the same buckets as before just now we'd be properly passing them in
and `histogram_quantile` will work correctly as long as we don't use that on old
data since that would remain broken.

I could also notice that the counts for some of these buckets are exactly the
same. For example in my case the buckets:

0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.0006, 0.0007, 0.0008, 0.0009

all had exactly the same sum value. This indicates that while we had some
requests that took less than 0.0001 seconds, we had none that took between
0.0001 and 0.0009 seconds. So I probably don't need to include all these
buckets.

Instead what I might decide is that I'd prefer to use log-linear buckets with
a smaller number of linear buckets per magnitude. For example, I might decide to
do:

```
collector.histogram({
    name: 'http_request_duration_seconds',
    help: 'total time to process requests',
    buckets: artedi.logLinearBuckets(10, -4, 3, 4)
});
```

after playing around with the node repl and finding that this gives me buckets
like:

```
> artedi.logLinearBuckets(10, -4, 3, 4)
[ 0.0003, 0.0005, 0.0008, 0.001, 0.0025, 0.005, 0.0075, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000 ]
>
```

which covers the same range of datapoints with fewer total buckets (32 vs 49)
while also being spread much more evenly across each magnitude.

There are 3 of these helper functions in order to [help you generate an array of
bucket values](docs/API.md#bucket-generators).

## What about my existing data?

The unfortunate consequence of the problem here with node-artedi version 1.x is
that any existing histogram data is likely to be some degree of nonsense. If
you're not *really* attached to all your old data, the easiest thing to do would
be:

 1. Update all your code to node-artedi version 2.x and fixed buckets
 2. Wipe out all your existing Prometheus data and start from scratch

This will ensure that for all your histogram metrics, only good values exist and
you should be safe to run `histogram_quantile` across any range of your new
data.

If you need to keep your existing data for some reason, or if you need a more
gradual transition, what you can do instead is:

 1. Update your code to use node-artedi version 2.x
 2. Add *2* versions of each of your histogram metrics. E.g.
    `http_request_duration_seconds` and `http_request_duration_seconds_v2`
    and have your code update both. The first should use a set of buckets that
    includes all the buckets you've used in your existing data. The second can
    include the buckets you'd *like* to be using.
 3. Update your dashboards and application instances until everything is using
    the _v2 version of your histograms.
 4. Remove the code that updates the old v1 histograms.

In order to help with this, there's some code in
[examples/artedi_v1_buckets.js](examples/artedi_v1_buckets.js) which you could
use in your application to generate buckets that match those your application
might have used with node-artedi version 1.x. You could also just hardcode the
array of values you need in your application.
