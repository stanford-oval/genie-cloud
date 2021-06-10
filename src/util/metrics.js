// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import * as Url from 'url';
import Prometheus from 'prom-client';
import onFinished from 'on-finished';

import * as Config from '../config';

export default function(app) {
    const httpRequestsTotal = new Prometheus.Counter({
        name: 'http_requests_total',
        help: 'Count the number of HTTP requests (grouped by method, route)',
        labelNames: ['method', 'route'],
    });
    const httpRequestFailureCount = new Prometheus.Counter({
        name: 'http_requests_failure_total',
        help: 'Count the number of failed HTTP requests (status >= 500) (grouped by method, route)',
        labelNames: ['method', 'route'],
    });
    const httpRequestDurationMs = new Prometheus.Histogram({
        name: 'http_request_duration_ms',
        help: 'Log HTTP request duration (grouped by method, route, code)',
        labelNames: ['method', 'route', 'code'],
        buckets: [0.10, 5, 15, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000] // buckets for response time from 0.1ms to 5s
    });
    const httpResponseSizeBytes = new Prometheus.Histogram({
        name: 'http_response_size_bytes',
        help: 'Log HTTP response size (grouped by method, route, code)',
        labelNames: ['method', 'route', 'code'],
        buckets: [0.5, 1, 5, 10, 100, 1000] // buckets for response size from 0.5kb to 1MB
    });

    app.use((req, res, next) => {
        let path;
        if (req.route === undefined) {
            // handled by serve-static or one of the middlewares killed it prematurely
            path = Url.parse(req.originalUrl).path;
        } else {
            path = req.route.path;
        }
        // ignore prometheus polls
        if (path === '/metrics') {
            next();
            return;
        }

        // this code is inspired by how morgan tracks connection duration
        const reqStart = new Date;
        onFinished(res, () => {
            const resEnd = new Date;

            const duration = resEnd.getTime() - reqStart.getTime();
            const size = res.getHeader('content-length');

            httpRequestsTotal.inc({
                method: req.method,
                route: path,
            });
            if (res.statusCode >= 500) {
                httpRequestFailureCount.inc({
                    method: req.method,
                    route: path,
                });
            }

            const labels = {
                method: req.method,
                route: path,
                code: res.statusCode
            };
            httpRequestDurationMs.observe(labels, duration);
            if (size !== undefined && !Array.isArray(size))
                httpResponseSizeBytes.observe(labels, duration);
        });
        next();
    });

    // handle /metrics before everything else, as it is a polled endpoint
    // and we don't want to increase the load on the server
    //
    // (this includes the origin-based redirect, as prometheus talks directly
    // to a specific almond instance, and bypasses the load balancer in front,
    // so the host part of the request will be wrong)
    app.get('/metrics', (req, res, next) => {
        if (Config.PROMETHEUS_ACCESS_TOKEN !== null &&
            req.headers['authorization'] !== `Bearer ${Config.PROMETHEUS_ACCESS_TOKEN}`) {
            res.status(403).end();
            return;
        }

        res.set('Content-Type', Prometheus.register.contentType);
        res.end(Prometheus.register.metrics());
    });
}
