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

const db = require('../util/db');

function extractSchema(into, invocation) {
    if (!invocation)
        return;
    var name;
    if (typeof invocation.name === 'string')
        name = invocation.name;
    else
        name = invocation.name.id;

    var match = /^tt:([^\.]+)\.(.+)$/.exec(invocation.name.id);
    if (match === null)
        throw new TypeError('Channel name not in proper format');
    into.push(match[1]);
}

function processOneLine(dbClient, type, language, line) {
    var split = line.split('\t');

    var utterance = split[0];
    var json = split[1];
    var parsed = JSON.parse(json);

    var into = [];
    if (parsed.rule) {
        extractSchema(into, parsed.rule.trigger);
        extractSchema(into, parsed.rule.query);
        extractSchema(into, parsed.rule.action);
    } else {
        extractSchema(into, parsed.trigger);
        extractSchema(into, parsed.query);
        extractSchema(into, parsed.action);
    }

    return db.insertOne(dbClient, "insert into example_utterances(type, language, utterance, target_json) values (?, ?, ?, ?)", [type, language, utterance, json])
        .then((exampleId) => {
            if (into.length === 0)
                return;

            return db.query(dbClient, "insert into example_rule_schema(example_id, schema_id) select ?, id from device_schema where kind in (?)",
                [exampleId, into]);
        }).catch((e) => {
            console.error('Failed to migrate ' + utterance + ': ' + e.message);
        });
}

function main() {
    var input = byline(fs.createReadStream(process.argv[2]));
    input.setEncoding('utf8');
    var type = process.argv[3];
    var language = process.argv[4];

    var promises = [];

    db.withTransaction((dbClient) => {
        return Q.Promise(function(callback, errback) {
            input.on('data', (line) => promises.push(processOneLine(dbClient, type, language, line)));
            input.on('error', errback);
            input.on('end', callback);
        }).then(() => {
            return Q.all(promises);
        });
    }).then(() => {
        process.exit();
    }).done();
}
main();
