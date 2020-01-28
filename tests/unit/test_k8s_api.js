// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Jim Deng <jim.deng@alumni.stanford.edu>
//
// See COPYING for details
'use strict';

// Tests k8s api signature does not change after upgrades 
function getArgs(func) {
  var args = func.toString().match(/\S+\s*?\(([^)]*)\)/)[1];
  return args.split(',').map(function(arg) {
    return arg.replace(/\/\*.*\*\//, '').trim();
  }).filter(function(arg) {
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
    const args = getArgs(k8sCore.listEndpointsForAllNamespaces)
    assert.strictEqual(args[2], 'fieldSelector');
}

function main() {
    testDeleteNamespacedJob();
    testListEndpointsForAllNamespaces();
}
module.exports = main;
if (!module.parent)
    main();
