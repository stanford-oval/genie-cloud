// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');

const db = require('../util/db');

function processOne(dbClient, device) {
    var manifest = JSON.parse(device.code);
    manifest.module_type = 'org.thingpedia.v1';

    for (var ftype of ['triggers', 'queries', 'actions']) {
        var where = (manifest[ftype] || {});
        for (var name in where) {
            var inv = where[name];
            var args = [];
            if (!Array.isArray(inv.schema)) {
                console.log('Weird manifest in ' + device.device_id + '.' + name, inv);
                inv.args = args;
                delete inv.schema;
                delete inv.params;
                delete inv.questions;
                delete inv.required;
                continue;
            }
            inv.schema.forEach(function(schema, i) {
                args.push({
                    type: schema,
                    name: inv.params ? inv.params[i] : inv.args[i],
                    question: (inv.questions ? inv.questions[i] : '') || '',
                    required: (inv.required ? inv.required[i] : false) || false,
                });
            });
            inv.args = args;
            delete inv.schema;
            delete inv.params;
            delete inv.questions;
            delete inv.required;
        }
    }

    return db.query(dbClient, 'update device_code_version set code = ? where device_id = ? and version = ?', [JSON.stringify(manifest), device.device_id, device.version])
        .then(() => console.log('Processed ' + device.device_id + ' at version ' + device.version));
}

function main() {
    db.withTransaction((dbClient) => {
        return db.selectAll(dbClient, "select * from device_code_version").then((devices) => {
            return Q.all(devices.map((d) => processOne(dbClient, d)));
        });
    }).then(() => process.exit()).done();
}
main();
