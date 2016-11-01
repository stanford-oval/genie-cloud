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

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const schema = require('../model/schema');
const exampleModel = require('../model/example');
const SempreSyntax = require('../util/sempre_syntax');
const SchemaRetriever = require('./deps/schema_retriever');

var _schemaRetriever;

function readAll(stream, promises) {
    if (stream === null)
        return;

    return Q.Promise(function(callback, errback) {
        stream.on('data', (data) => {
            var line = data.split(/\t/);
            var utterance = line[0];
            var target_json = line[1];
            promises.push(Q.try(function() {
                var parsed = JSON.parse(target_json);
                // if not ThingTalk-like, assume valid in syntax
                if (!parsed.rule && !parsed.action && !parsed.query && !parsed.trigger)
                    return;
                return SempreSyntax.verify(_schemaRetriever, parsed);
            }).catch((e) => {
                console.error('Failed to handle ' + utterance + ': ' + e.message);
            }));
        });

        stream.on('end', () => callback());
        stream.on('error', errback);
    });
}

function main() {
    var onlineLearn = process.argv.length >= 3 ? byline(fs.createReadStream(process.argv[2])) : null;
    if (onlineLearn !== null)
        onlineLearn.setEncoding('utf8');
    var test = process.argv.length >= 4 ? byline(fs.createReadStream(process.argv[3])) : null;
    if (test !== null)
        test.setEncoding('utf8');

    db.withClient((dbClient) => {
        _schemaRetriever = new SchemaRetriever(dbClient, 'en-US');
        var promises = [];

        return exampleModel.getAll(dbClient).then((examples) => {
            examples.forEach((ex) => {
                if (ex.is_base)
                    return;

                promises.push(Q.try(function() {
                    return SempreSyntax.verify(_schemaRetriever, JSON.parse(ex.target_json));
                }).catch((e) => {
                    console.error('Failed to handle ' + ex.utterance + ': ' + e.message);
                }));
            });
        }).then(() => {
            return Q.all([readAll(onlineLearn, promises), readAll(test, promises)]);
        }).then(function() {
            return Q.all(promises);
        });
    }).then(() => {
        process.exit();
    }).done();
}
main();
