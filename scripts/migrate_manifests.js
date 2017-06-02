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
    try {
        var manifest = JSON.parse(device.code);
    } catch(e) {
        console.log('Failed to parse meta in ' + device.device_id + ' version ' + device.version);
        return;
    }

    var changed = true;
    for (var ftype of ['triggers','queries','actions']) {
        var where = (manifest[ftype] || {});
        for (var name in where) {
            var inv = where[name];
            inv.args.forEach((arg) => {
                if (ftype === 'actions') {
                    // action
                    arg.required = arg.is_input = true;
                } else {
                    arg.is_input = arg.required;
                }
            });
            changed = true;
        }
    }
    if (!changed)
        return;

    return db.query(dbClient, 'update device_schema_version set meta = ? where schema_id = ? and version = ?', [JSON.stringify(manifest), schema.schema_id, schema.version])
        .then(() => console.log('Processed ' + schema.schema_id + ' at version ' + schema.version));
}

function main() {
    db.withTransaction((dbClient) => {
        return db.selectAll(dbClient, "select * from device_schema_version, device_schema where id = schema_id").then((devices) => {
            return Q.all(devices.map((d) => processOne(dbClient, d)));
        });
    }).then(() => process.exit()).done();
}
main();
