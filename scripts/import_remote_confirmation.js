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
const byline = require('byline');

const db = require('../util/db');
const tokenizer = require('../util/tokenize');

function update(dbClient, kind, channel, confirmation_remote) {
    console.log(kind + ':' + channel);
    return db.query(dbClient, "update device_schema_channel_canonicals dscc, device_schema ds set confirmation_remote = ? "
        + " where ds.id = dscc.schema_id and dscc.language = 'en' and ds.kind = ? and dscc.name = ? and dscc.version = ds.developer_version",
        [confirmation_remote, kind, channel]);
}

function main() {
    db.withTransaction((dbClient) => {
        var promises = [];

        var parser = csv.parse({ columns: null });
        process.stdin.pipe(parser);
        //var output = fs.createWriteStream(process.argv[2]);
        //var writer = csv.stringify({ delimiter: '\t' });
        //writer.pipe(output);

        return Q.Promise((callback, errback) => {
            parser.on('data', (row) => {
                var [kind, channel] = [row[0], row[1]];

                var confirmation_remote = row[2];

                promises.push(Q.try(() => {
                    return update(dbClient, kind, channel, confirmation_remote);
                }).catch((e) => {
                    console.error('Failed to update ' + kindChannel);
                    // die uglily to fail the transaction
                    process.exit();
                }));
            });
            parser.on('error', errback);
            parser.on('end', callback);
        })
        .then(() => Q.all(promises));
        //.then(() => writer.end());
    }).then(() => process.exit()).done();
}
main();
