// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details

require('thingengine-core/lib/polyfill');

const Q = require('q');

const db = require('../util/db');
const schemaModel = require('../model/schema');
const deviceModel = require('../model/device');
const exampleModel = require('../model/example');

const ManifestToSchema = require('../util/manifest_to_schema');
const generateExamples = require('../util/generate_examples');

function main() {
    db.withTransaction(function(dbClient) {
        return db.selectAll(dbClient, "select d.id, d.primary_kind, d.global_name, dcv.code from "
            + "device_class d, device_code_version dcv where dcv.device_id = d.id and "
            + "dcv.version = d.developer_version and d.global_name is not null").then(function(rows) {
            return Q.all(rows.map(function(row) {
                return Q.try(function() {
                    var ast = JSON.parse(row.code);
                    return generateExamples(dbClient, row.global_name, ast);
                }).then(function() {
                    console.log('Processed ' + row.global_name);
                }).catch(function(e) {
                    console.error('Failed to process ' + row.global_name + ': ' + e.message);
                    console.error('Full row', row);
                });
            }));
        });
    }).then(function() {
        console.log('Done');
        process.exit();
    }).done();
}
main();
