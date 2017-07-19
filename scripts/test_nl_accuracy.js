// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const byline = require('byline');
const events = require('events');
const util = require('util');
const deepEqual = require('deep-equal');

const db = require('../util/db');
const AccuracyTester = require('./deps/test_nl_accuracy_common');

function handleName(name) {
    if (typeof name === 'string')
        return name;

    if (typeof name !== 'object' || name === null)
        throw new TypeError('Invalid name');

    if (typeof name.id === 'string')
        return name.id;

    if (typeof name.value === 'string')
        return name.value;

    throw new TypeError('Invalid name');
}

function handleSelector(sel) {
    sel = handleName(sel);

    let match = /^tt:(\$?[a-z0-9A-Z_\-]+)\.([a-z0-9A-Z_]+)$/.exec(sel);
    if (match === null)
        throw new TypeError('Invalid selector ' + sel);

    return [match[1], match[2]];
}

function getInvocationKind(set, inv) {
    if (!inv)
        return;
    set.add(handleSelector(inv.name)[0]);
}

function maybeFilterSubset(subset, ex) {
    if (!subset)
        return true;

    var json = JSON.parse(ex.target_json);
    var kinds = new Set;

    if (json.rule) {
        getInvocationKind(kinds, json.rule.trigger);
        getInvocationKind(kinds, json.rule.query);
        getInvocationKind(kinds, json.rule.action);
    } else {
        getInvocationKind(kinds, json.trigger);
        getInvocationKind(kinds, json.query);
        getInvocationKind(kinds, json.action);
    }

    for (var k of kinds) {
        if (!subset.has(k))
            return false;
    }
    return true;
}

function main() {
    var language = process.argv[2] || 'en';
    var types = (process.argv[3] || 'test').split(',');
    var subset = process.argv[4];
    if (subset)
        subset = new Set(subset.split(','));

    var queue = AccuracyTester();

    db.connect().then(([dbClient, done]) => {
        console.log('connected');
        var query = dbClient.query("select * from example_utterances where type in (?) and language = ?", [types, language]);
        query.on('result', (ex) => {
            if (maybeFilterSubset(subset, ex))
                queue.enqueue(ex);
        });
        query.on('end', () => { queue.done(); });
        query.on('error', (e) => { console.error(e) });
    }).done();
}

main();
