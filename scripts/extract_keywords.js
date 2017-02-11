// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const mysql = require('mysql');

const db = require('../util/db');
const tokenize = require('../util/tokenize');

const IGNORED_WORDS = new Set(["in", "is", "of", "or", "not", "at", "as", "by", "my", "i", "from", "for", "an",
    "on", "a", "to", "with", "and", "when", "notify", "monitor", "it",
    "me", "the", "if", "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwz"]);

function findInvocation(json) {
    if (json.trigger)
        return json.trigger.name.id;
    if (json.query)
        return json.query.name.id;
    if (json.action)
        return json.action.name.id;
    throw new Error('Not triggery query or action');
}

function extract(dbClient, language, row) {
    var tokens = tokenize.tokenize(row.utterance);

    var match = /^tt:([^\.]+)\.(.+)$/.exec(findInvocation(JSON.parse(row.target_json)));
    if (match === null)
        throw new TypeError('Channel name not in proper format');
    var kind = match[1];
    var channelName = match[2];

    for (var token of tokens) {
        if (token.startsWith('$'))
            continue;
        if (IGNORED_WORDS.has(token))
            continue;
        if (token.length < 2)
            continue;

        console.log(token + ',' + kind + ':' + channelName);
        //dbClient.query("insert ignore into lexicon (language, token, schema_id, channel_name) "
        //    + " select ?,?,id,? from device_schema where kind = ?", [language,token,channelName,kind]);
    }
}

function main() {
    var language = process.argv[2] || 'en';
    var dbClient = mysql.createConnection(process.env.DATABASE_URL);

    var q = dbClient.query("select id,utterance,target_json from example_utterances where type = "
        + "'thingpedia' and is_base and language = ?", [language]);

    q.on('result', (row) => extract(dbClient, language, row));
    q.on('end', () => dbClient.end());
}
main();
