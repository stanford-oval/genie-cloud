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
const model = require('../model/example');

function main() {
    db.withTransaction(function(dbClient) {
        return model.getAll(dbClient, null).then(function(examples) {
            return Q.all(examples.map(function(ex) {
                console.log('Processing ' + ex.utterance);
                return Q.try(function() {
                    var json = JSON.parse(ex.target_json);
                    if (typeof json.action.name !== 'string')
                        return;
                    json.action.name = {
                        id: json.action.name
                    };
                    return model.update(dbClient, ex.id, {
                        target_json: JSON.stringify(json)
                    });
                }).catch(function(e) {
                    console.log('Processing example failed: ' + e.message);
                });
            }));
        });
    }).finally(() => { process.exit(); }).done();
}

main();
