// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const csv = require('csv');

const db = require('../util/db');

function count(invocation) {
    if (!invocation)
        return 0;
    return invocation.args.length;
}

function inc(counter, key) {
    if (counter[key]===undefined)
        counter[key] = 1;
    else
        counter[key]++;
}

function main() {
    var file = fs.createWriteStream(process.argv[2]);
    var output = csv.stringify();
    output.pipe(file);

    var language = process.argv[3] || 'en';
    var types = (process.argv[4] || 'online,test').split(',');

    var counter = {};

    db.connect().then(([dbClient, done]) => {
        console.log('connected');
        var q = dbClient.query('select id,target_json from example_utterances where not is_base and language = ? and type in (?)', [language,types]);

        q.on('result', (ex) => {
            var parsed = JSON.parse(ex.target_json);

            var type;
            var cnt = 0;
            if (parsed.rule) {
                type = 'compound';
                cnt += count(parsed.rule.trigger);
                cnt += count(parsed.rule.query);
                cnt += count(parsed.rule.action);
            } else {
                if (!parsed.action && !parsed.query && !parsed.trigger) {
                    console.log(ex.id + ' is not ThingTalk');
                    return;
                }

                type = 'primitive';
                cnt += count(parsed.action);
                cnt += count(parsed.trigger);
                cnt += count(parsed.query);
            }

            inc(counter, type +','+ cnt);
            output.write([ex.id, type, cnt]);
        });
        q.on('end', () => {
            console.log('result', counter);
            output.end();
            done();
        })
    }).done();

    file.on('finish', () => process.exit());
}

main();
