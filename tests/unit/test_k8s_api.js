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
// Author: Jim Deng <jim.deng@alumni.stanford.edu>
'use strict';

// Tests k8s api signature does not change after upgrades 
function getArgs(func) {
  var args = func.toString().match(/\S+\s*?\(([^)]*)\)/)[1];
  return args.split(',').map((arg) => {
    return arg.replace(/\/\*.*\*\//, '').trim();
  }).filter((arg) => {
    return arg;
  });
}

const assert = require('assert');
const k8s = require('@kubernetes/client-node');
const fakeConfig = {
    clusters: [
        {
            name: 'cluster',
            server: 'foo.bar.com',
        }
    ],
    contexts: [
        {
            cluster: 'cluster',
            user: 'user',
        }
    ],
    users: [
        {
            name: 'user',
        }
    ],
};
const kc = new k8s.KubeConfig();
Object.assign(kc, fakeConfig);
const k8sApi = kc.makeApiClient(k8s.BatchV1Api);
const k8sCore = kc.makeApiClient(k8s.CoreV1Api);

function testDeleteNamespacedJob() {
    const args = getArgs(k8sApi.deleteNamespacedJob);
    assert.strictEqual(args[0], 'name');
    assert.strictEqual(args[1], 'namespace');
    assert.strictEqual(args[6], 'propagationPolicy');
}

function testListEndpointsForAllNamespaces() {
    const args = getArgs(k8sCore.listEndpointsForAllNamespaces);
    assert.strictEqual(args[2], 'fieldSelector');
}

function main() {
    testDeleteNamespacedJob();
    testListEndpointsForAllNamespaces();
}
module.exports = main;
if (!module.parent)
    main();
