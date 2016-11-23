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
const crypto = require('crypto');

const db = require('../util/db');

function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
}

function main() {
    db.withTransaction((dbClient) => {
        return db.selectAll(dbClient, "select id from users where storage_key = ''").then((rows) => {
            console.log('Read ' + rows.length + ' rows');
            return Q.all(rows.map((row) => {
                return db.query(dbClient, "update users set storage_key = ? where id = ?", [makeRandom(), row.id]);
            }));
        });
    }).then(() => process.exit()).done();
}

main();
