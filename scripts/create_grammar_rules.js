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
const csv = require('csv');

const db = require('../util/db');
const tokenize = require('../util/tokenize');

var insertBatch = [];
function insert(dbClient, schemaId, channelName, rule) {
    insertBatch.push(['en', schemaId, 0, channelName, rule]);
    if (insertBatch.length < 100)
        return;

    var batch = insertBatch;
    insertBatch = [];
    return db.insertOne(dbClient,
        "insert into grammar_rule(language,schema_id,version,channel_name,rule) values ?", [batch]);
}
function finishBatch(dbClient) {
    if (insertBatch.length === 0)
        return;
    return db.insertOne(dbClient,
        "insert into grammar_rule(language,schema_id,version,channel_name,rule) values ?", [insertBatch]);
}

function clean(utterance) {
    return tokenize.tokenize(utterance).filter((t) => !/^[.,]+$/.test(t)).join(' ');
}

function main() {
    db.withTransaction(function(dbClient) {
        var q = dbClient.query("select id,schema_id,utterance,target_json from example_utterances where language = 'en' and type = 'thingpedia' and is_base");

        var promises = [];
        q.on('result', function(ex) {
            var schemaId = ex.schema_id;
            var parsed = JSON.parse(ex.target_json);
            var invocation;
            if (parsed.action)
                invocation = parsed.action;
            else if (parsed.trigger)
                invocation = parsed.trigger;
            else if (parsed.query)
                invocation = parsed.query;
            else
                throw new TypeError(ex.id + ' is not trigger query or action');
            var match = /^tt:([^\.]+)\.(.+)$/.exec(invocation.name.id);
            if (match === null)
                throw new TypeError('Channel name not in proper format');
            var kind = match[1];
            var channelName = match[2];

            var rule = clean(ex.utterance);

            promises.push(insert(dbClient, schemaId, channelName, rule));
        });

        return Q.Promise(function(callback, errback) {
            q.on('end', callback);
            q.on('error', errback);
        }).then(() => Q.all(promises))
        .then(() => finishBatch(dbClient));
    }).then(() => process.exit()).done();
}

main();
