# Changelog

## Not yet released

None

## 2.0.4

- TRITON-2325 CVE-2021-3918: json-schema is vulnerable to Prototype Pollution

## 2.0.3

- TRITON-2254 Change joyMattermostNotification to joySlackNotification

## 2.0.2

- MANTA-5184 bump dtrace-provider dep and relax other deps

## 2.0.1

* MANTA-4959 Use Math.log10() ployfill

## 2.0.0 [backward incompatible if you use histograms]

* #17 Histogram buckets completely changed to be compatible with Prometheus. You
  can now either pass in an array of bucket values. If you do not pass in bucket
  values, you will get the default buckets:
    ```
    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    ```
* Important: see [docs/migrating.md](docs/migrating.md) for details on migrating
  from node-artedi v1.x to v2.x.

## 1.4.1
* #15 improve the performance of hashObj()

## 1.4.0
* #14 Allow for metrics in a MetricVector to be optionally expired or reset to a
    default value

## 1.3.0
* #13 add DTrace probes

## 1.2.1
* #12 histograms can't observe values less than one

## 1.2.0
* #9 Create an accessor function for collector values

## 1.1.1
* [MORAY-447](https://smartos.org/bugview/MORAY-447) strange latency data point
    in reported moray metrics

## 1.1.0
* #5 Implement set() for Gauge collectors
* #6 Implement basic triggered metrics
* #7 artedi shouldn't attach timestamps to prometheus metrics
* #8 artedi collectors should share more code

## 1.0.0
* #3 Support Prometheus-style counters and histograms
