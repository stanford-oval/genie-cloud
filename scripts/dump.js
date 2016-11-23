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
const SempreSyntax = require('../util/sempre_syntax');

function countOne(invocation) {
    if (!invocation)
        return 0;
    return invocation.args.length;
}

function count(parsed, ex) {
    var type, cnt = 0;

    if (parsed.rule) {
        type = 'compound';
        cnt += countOne(parsed.rule.trigger);
        cnt += countOne(parsed.rule.query);
        cnt += countOne(parsed.rule.action);
    } else {
        if (!parsed.action && !parsed.query && !parsed.trigger) {
            console.log(ex.id + ' is not ThingTalk');
            return;
        }

        type = 'primitive';
        cnt += countOne(parsed.action);
        cnt += countOne(parsed.trigger);
        cnt += countOne(parsed.query);
    }

    return [type, cnt];
}

function main() {
    var file = fs.createWriteStream(process.argv[2]);
    var output = csv.stringify();
    output.pipe(file);

    var language = process.argv[3] || 'en';

    db.connect().then(([dbClient, done]) => {
        console.log('connected');
        var q = dbClient.query("select id,target_json,type,utterance from example_utterances where language = ? and "
         + "(type like 'turking-prim%' or type like 'turking-compound%' or type like 'test-prim%' or type like 'test-compound%')", [language]);

        q.on('result', (ex) => {
            var parsed = JSON.parse(ex.target_json);

            var [type, cnt] = count(parsed, ex);

            output.write([ex.id, ex.target_json, ex.utterance, ex.type.startsWith('test') ? 'test' : 'train', type, cnt]);
        });
        q.on('end', () => {
            output.end();
            done();
        })
    }).done();

    file.on('finish', () => process.exit());
}

main();
