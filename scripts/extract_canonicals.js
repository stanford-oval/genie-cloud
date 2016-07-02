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
const model = require('../model/schema');

function main() {
    db.withTransaction(function(dbClient) {
        return model.getAll(dbClient, null).then(function(schemas) {
            return Q.all(schemas.map(function(s) {
                console.log('Processing ' + s.kind);
                return Q.try(function() {
                    return model.insertChannels(dbClient, s.id, s.kind, s.developer_version,
                                                JSON.parse(s.types), JSON.parse(s.meta));
                }).catch(function(e) {
                    console.log('Extracting channels of ' + s.kind + ' failed: ' + e.message);
		    console.log(e.stack);
                });
            }));
        });
    }).finally(() => { process.exit(); }).done();
}

main();
