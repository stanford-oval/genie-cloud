
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Jim Deng <jim.deng@alumni.stanford.edu>
//
// See COPYING for details
"use strict";

const httpProxy = require('http-proxy');
const queryString = require('querystring');
const k8s = require('@kubernetes/client-node');

// ProxyServer fans out http requests to all replicas in 
// a kubernetes service.  Can only be used with kubernetes backend.
module.exports = class ProxyServer {
    constructor(name) {
        // k8s service name
        this.name = name;

        // setup k8s api
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        this.coreApi = kc.makeApiClient(k8s.CoreV1Api);

        // setup proxy
        this.proxy = httpProxy.createProxyServer();
        this.proxy.on('proxyReq', (proxyReq, req, res, options) => {
            // set header to identify the request is proxyed
            proxyReq.setHeader('X-Almond-Fanout', 'true');

            // use original url in proxy request
            proxyReq.path = req.originalUrl;

            // restream parsed body before proxying. Otherwise, 
            // the the proxy request will hang in reading a stream.
            if (!req.body || !Object.keys(req.body).length) 
              return;

            var contentType = proxyReq.getHeader('Content-Type');
            var bodyData;

            if (contentType === 'application/json')
              bodyData = JSON.stringify(req.body);

            if (contentType === 'application/x-www-form-urlencoded') 
              bodyData = queryString.stringify(req.body);

            if (bodyData) {
              proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
              proxyReq.write(bodyData);
            }
        });
    }

    async fanout(req, res) {
        try {
            const replicas = await this.getEndpoints(this.name);
            if (replicas.length === 0 )
                throw new Error(`unexpected zero endpoints from ${this.name} service`);
            console.log('fanout requests to', replicas);
            for (const ipPort of replicas) 
                this.proxy.web(req, res, { target: `http://${ipPort}`} );
        } catch (e) {
            console.log('fanout error:', e);
            res.status(500).json({ error: 'Internal server errror' });
        }
    }

    async getEndpoints(name) {
        const ipPorts = [];
        const resp = await this.coreApi.listEndpointsForAllNamespaces(
            undefined /*allowWatchBookmarks*/,
            undefined /*_continue*/, 
            `metadata.name=${name}` /*fieldSelector*/);
        for (const item of resp.body.items) {
            for (const subset of item.subsets) {
                if (!subset.ports || subset.ports.length === 0)
                    throw new Error('failed to get endpoints port');
                // use the first port since all addresses use the same port
                const port = subset.ports[0].port;
                for (const addr of subset.addresses)
                    ipPorts.push(`${addr.ip}:${port}`);
            }
        }
        return ipPorts;
    }

    isProxy(req) {
        return req.header('X-Almond-Fanout') === 'true';
    }
};