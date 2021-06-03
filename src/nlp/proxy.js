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

// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Jim Deng <jim.deng@alumni.stanford.edu>


const httpProxy = require('http-proxy');
const queryString = require('querystring');
const k8s = require('@kubernetes/client-node');
const os = require('os');

function getLocalIps() {
    const localIps = [];
    for (const ifaceList of Object.values(os.networkInterfaces())) {
        for (const iface of ifaceList) {
            if (iface.internal)
                continue;
            localIps.push(iface.address);
        }
    }
    return localIps;
}

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

            let contentType = proxyReq.getHeader('Content-Type');
            let bodyData;

            if (contentType === 'application/json')
              bodyData = JSON.stringify(req.body);

            if (contentType === 'application/x-www-form-urlencoded') 
              bodyData = queryString.stringify(req.body);

            if (bodyData) {
              proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
              proxyReq.write(bodyData);
            }
        });

        this.localIps = getLocalIps(); 
    }

    async fanout(req, res) {
        try {
            const replicas = await this.getEndpoints(this.name);
            if (replicas.length === 0 )
                throw new Error(`unexpected zero endpoints from ${this.name} service`);
            console.log('fanout requests to', replicas);
            for (const ipPort of replicas)
                this.proxy.web(req, res, { target: `http://${ipPort}`} );
        } catch(e) {
            console.log('fanout error:', e);
            res.status(500).json({ error: 'Internal server errror' });
        }
    }

    async getEndpoints(name, skipLocal=false) {
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
                for (const addr of subset.addresses) {
                    if (skipLocal && this.localIps.includes(addr.ip)) {
                        console.log('skipping local endpoint', addr.ip);
                        continue;
                    }
                    ipPorts.push(`${addr.ip}:${port}`);
                }
            }
        }
        return ipPorts;
    }

    header() {
        return { 'X-Almond-Fanout': 'true'};
    }

    isProxy(req) {
        return req.header('X-Almond-Fanout') === 'true';
    }
};