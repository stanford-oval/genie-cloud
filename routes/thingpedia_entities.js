// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const csv = require('csv');
const fs = require('fs');
const Stream = require('stream');

const db = require('../util/db');
const entityModel = require('../model/entity');
const schemaModel = require('../model/schema');
const user = require('../util/user');
const platform = require('../util/platform');
const tokenizer = require('../util/tokenize');
const iv = require('../util/input_validation');
const { BadRequestError, ForbiddenError } = require('../util/errors');

var router = express.Router();

async function doCreate(req, res) {
    const language = 'en';

    try {
        await db.withTransaction(async (dbClient) => {
            let match = NAME_REGEX.exec(req.body.entity_id);
            if (match === null)
                throw new BadRequestError(req._("Invalid entity type ID."));

            let [, prefix, /*suffix*/] = match;

            if ((req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0) {
                let row;
                try {
                    row = await schemaModel.getByKind(dbClient, prefix);
                } catch(e) {
                    if (e.code !== 'ENOENT')
                        throw e;
                }
                if (!row || row.owner !== req.user.developer_org)
                    throw new ForbiddenError(req._("The prefix of the entity ID must correspond to the ID of a Thingpedia device owned by your organization."));
            }

            await entityModel.create(dbClient, {
                name: req.body.entity_name,
                id: req.body.entity_id,
                is_well_known: false,
                has_ner_support: !req.body.no_ner_support
            });

            if (req.body.no_ner_support)
                return;

            if (!req.files.upload || !req.files.upload.length)
                throw new BadRequestError(req._("You must upload a CSV file with the entity values."));

            const parser = csv.parse({ delimiter: ',' });
            fs.createReadStream(req.files.upload[0].path).pipe(parser);

            const transformer = new Stream.Transform({
                objectMode: true,

                transform(row, encoding, callback) {
                    if (row.length !== 2) {
                        callback();
                        return;
                    }

                    const value = row[0].trim();
                    const name = row[1];

                    const tokens = tokenizer.tokenize(name);
                    const canonical = tokens.join(' ');
                    callback(null, {
                        language,
                        entity_id: req.body.entity_id,
                        entity_value: value,
                        entity_canonical: canonical,
                        entity_name: name
                    });
                },

                flush(callback) {
                    process.nextTick(callback);
                }
            });

            const writer = entityModel.insertValueStream(dbClient);
            parser.pipe(transformer).pipe(writer);

            // we need to do a somewhat complex error handling dance to ensure
            // that we don't have any inflight requests by the time we terminate
            // the transaction, otherwise we might run SQL queries on the wrong
            // connection/transaction and that would be bad
            await new Promise((resolve, reject) => {
                let error;
                parser.on('error', (e) => {
                    error = new BadRequestError(e.message);
                    transformer.end();
                });
                transformer.on('error', (e) => {
                    error = e;
                    writer.end();
                });
                writer.on('error', reject);
                writer.on('finish', () => {
                    if (error)
                        reject(error);
                    else
                        resolve();
                });
            });
        });

        res.redirect(303, '/thingpedia/entities');
    } finally {
        if (req.files.upload && req.files.upload.length)
            await Q.nfcall(fs.unlink, req.files.upload[0].path);
    }
}

router.post('/create', multer({ dest: platform.getTmpDir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }),
    user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ entity_id: 'string', entity_name: 'string', no_ner_support: 'boolean' }), async (req, res, next) => {
    doCreate(req, res).catch(next);
});

router.use(csurf({ cookie: false }));

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return entityModel.getAll(dbClient);
    }).then((rows) => {
        res.render('thingpedia_entity_list', { page_title: req._("Thingpedia - Entity Types"),
                                               csrfToken: req.csrfToken(),
                                               entities: rows });
    }).catch(next);
});

router.get('/by-id/:id', (req, res, next) => {
    db.withClient((dbClient) => {
        return Promise.all([
            entityModel.get(dbClient, req.params.id),
            entityModel.getValues(dbClient, req.params.id)
        ]);
    }).then(([entity, values]) => {
        res.render('thingpedia_entity_values', { page_title: req._("Thingpedia - Entity Values"),
                                                 entity: entity,
                                                 values: values });
    }).catch(next);
});

const NAME_REGEX = /([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_]*)/;

module.exports = router;
