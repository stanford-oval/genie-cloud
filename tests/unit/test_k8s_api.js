// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
'use strict';

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

function testdeleteNamespacedJob() {
    assert.strictEqual(getArgs(k8sApi.deleteNamespacedJob)[0], 'name')
    assert.strictEqual(getArgs(k8sApi.deleteNamespacedJob)[1], 'namespace')
    assert.strictEqual(getArgs(k8sApi.deleteNamespacedJob)[6], 'propagationPolicy')
}


function main() {
    testdeleteNamespacedJob();
}
module.exports = main;
if (!module.parent)
    main();
