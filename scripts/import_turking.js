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
const SchemaRetriever = require('./deps/schema_retriever');
const SempreSyntax = require('../util/sempre_syntax');

function insert(dbClient, utterance, target_json) {
    return db.insertOne(dbClient, "insert into example_utterances(language,type,utterance,target_json,click_count) values('en','generated',?,?,-1)", [utterance, target_json]);
}

function main() {
    db.withTransaction((dbClient) => {
        var promises = [];
        var schemas = new SchemaRetriever(dbClient, 'en-US', true);

        var parser = csv.parse({ columns: null, relax: true, delimiter: '\t' });
        process.stdin.pipe(parser);
        //var output = fs.createWriteStream(process.argv[2]);
        //var writer = csv.stringify({ delimiter: '\t' });
        //writer.pipe(output);

        return Q.Promise((callback, errback) => {
            parser.on('data', (row) => {
                //var tt = row.ThingTalk.trim();
                var tt = row[0];
                var utterance = row[1];
                //var silei = row.Silei.trim();
                //var silei2 = row['Silei 2'].trim();
                //var giovanni = row.Giovanni.trim();

                //if (row.Meaningfulness === 'N' || row['Meaningfulness for Giovanni'] === 'N')
                //    return;

                promises.push(Q.try(() => {
                    var json = SempreSyntax.toSEMPRE(tt);
                    var json_str = JSON.stringify(json);
                    return SempreSyntax.verify(schemas, json).then(() => {
                        return insert(dbClient, utterance, json_str);
                        //console.log(utterance + '\t' + json_str);
                    /*}).then(() => {
                        if (silei2)
                            return insert(dbClient, silei2, json_str);
                    }).then(() => {
                        if (giovanni)
                            return insert(dbClient, giovanni, json_str);*/
                    });
                }).catch((e) => {
                    console.error('Failed to verify ' + tt + '   :' + e.message);
                }));
            });
            parser.on('error', errback);
            parser.on('end', callback);
        })
        .then(() => Q.all(promises))
        //.then(() => writer.end());
    }).then(() => process.exit()).done();
}
main();
