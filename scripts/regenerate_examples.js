// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');

const db = require('../util/db');
const schemaModel = require('../model/schema');
const deviceModel = require('../model/device');
const exampleModel = require('../model/example');

const ManifestToSchema = require('../util/manifest_to_schema');
const generateExamples = require('../util/generate_examples');

function findInvocation(ex) {
    const REGEXP = /^(?:tt:)?(\$?[a-z0-9A-Z_.-]+)\.([a-z0-9A-Z_]+)$/;
    var parsed = JSON.parse(ex.target_json);
    if (parsed.action)
        return ['actions', REGEXP.exec(parsed.action.name.id)];
    else if (parsed.trigger)
        return ['triggers', REGEXP.exec(parsed.trigger.name.id)];
    else if (parsed.query)
        return ['queries', REGEXP.exec(parsed.query.name.id)];
    else
        return null;
}

function main() {
    var language = process.argv[2] || 'en';

    db.withTransaction(function(dbClient) {
        return schemaModel.getAll(dbClient).then(function(rows) {
            return db.selectAll(dbClient, "select * from example_utterances where is_base and schema_id is not null and language = ?", [language])
                .then(function(examples) {
                    var exampleMap = {};

                    examples.forEach(function(ex) {
                        var res;
                        try {
                            res = findInvocation(ex);
                        } catch(e) {
                            console.log(e.stack);
                            return;
                        }
                        if (!res || !res[1]) {
                            console.log('Ignored example ' + ex.utterance);
                            return;
                        }

                        var where = res[0];
                        var kind = res[1][1];
                        var name = res[1][2];
                        if (!exampleMap[kind]) {
                            exampleMap[kind] = {
                                actions: {},
                                triggers: {},
                                queries: {}
                            };
                        }
                        if (!exampleMap[kind][where][name])
                            exampleMap[kind][where][name] = [];
                        exampleMap[kind][where][name].push(ex.utterance);

                    });

                    return Q.all(rows.map(function(row) {
                        if (row.kind_type === 'global')
                            return;

                        return Q.try(function() {
                            var ast = ManifestToSchema.toManifest(JSON.parse(row.types), JSON.parse(row.meta));

                            var n = 0;
                            for (var where of ['actions', 'triggers', 'queries']) {
                                for (var name in ast[where]) {
                                    if (exampleMap[row.kind] && exampleMap[row.kind][where][name]) {
                                        ast[where][name].examples = exampleMap[row.kind][where][name];
                                        n += ast[where][name].examples.length;
                                    }
                                }
                            }
                            console.log('Found ' + n + ' examples for ' + row.kind);

                            return generateExamples(dbClient, row.kind, ast, language);
                        }).then(function() {
                            console.log('Processed ' + row.kind);
                        }).catch(function(e) {
                            console.error('Failed to process ' + row.kind + ': ' + e.message);
                            console.error('Full row', row);
                        });
                    }));
                });
        });
    }).then(function() {
        console.log('Done');
        process.exit();
    }).done();
}
main();
