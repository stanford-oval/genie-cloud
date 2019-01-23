// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
const stream = require('stream');

const db = require('../util/db');
const stringModel = require('../model/strings');
const schemaModel = require('../model/schema');
const user = require('../util/user');
const platform = require('../util/platform');
const I18n = require('../util/i18n');
const TokenizerService = require('../util/tokenizer_service');
const iv = require('../util/input_validation');

var router = express.Router();

const NAME_REGEX = /([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_]*)/;

async function doCreate(req, res) {
    const language = I18n.localeToLanguage(req.locale);

    try {
        await db.withTransaction(async (dbClient) => {
            let match;

            try {
                match = NAME_REGEX.exec(req.body.type_name);
                if (match === null)
                    throw new Error('Invalid string type ID');
                if (!req.body.name)
                    throw new Error('Missing name');
                if (['public-domain', 'free-permissive', 'free-copyleft', 'non-commercial', 'proprietary'].indexOf(req.body.license) < 0)
                    throw new Error('Invalid license');

                let [, prefix, /*suffix*/] = match;

                if (req.user.developer_status < user.DeveloperStatus.ADMIN) {
                    let row;
                    try {
                        row = schemaModel.getByKind(dbClient, prefix);
                    } catch(e) {
                        /**/
                    }
                    if (!row || row.owner !== req.user.developer_org)
                        throw new Error('The prefix of the dataset ID must correspond to the ID of a Thingpedia device owned by your organization');
                }

                if (!req.files.upload || !req.files.upload.length)
                    throw new Error(req._("You must upload a CSV file with the entity values."));
            } catch(e) {
                res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: e });
                return;
            }

            const stringType = await stringModel.create(dbClient, {
                language: language,
                type_name: req.body.type_name,
                name: req.body.name,
                license: req.body.license,
                attribution: req.body.attribution || '',
            });

            const file = fs.createReadStream(req.files.upload[0].path);
            file.setEncoding('utf8');
            const parser = file.pipe(csv.parse({ delimiter: '\t', relax: true }));

            const transformer = new stream.Transform({
                readableObjectMode: true,
                writableObjectMode: true,

                transform(row, encoding, callback) {
                    const value = row[0];
                    let weight = parseFloat(row[1]) || 1.0;
                    if (!(weight > 0.0))
                        weight = 1.0;

                    if (req.body.preprocessed) {
                        callback(null, {
                            type_id: stringType.id,
                            value: value,
                            preprocessed: value,
                            weight: weight
                        });
                    } else {
                        TokenizerService.tokenize(language, value).then((result) => {
                            // ignore lines with uppercase (entity) tokens
                            if (result.tokens.some((t) => /[A-Z]/.test(t))) {
                                callback(null);
                            } else {
                                callback(null, {
                                    type_id: stringType.id,
                                    value: value,
                                    preprocessed: result.tokens.join(' '),
                                    weight: weight
                                });
                            }
                        }, (err) => callback(err));
                    }
                }
            });

            await stringModel.insertValueStream(dbClient, parser.pipe(transformer));
        });

        res.redirect(303, '/thingpedia/strings');
    } finally {
        if (req.files.upload && req.files.upload.length)
            await Q.nfcall(fs.unlink, req.files.upload[0].path);
    }
}

router.post('/create', multer({ dest: platform.getTmpDir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }), user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ type_name: 'string', name: 'string', license: 'string', attribution: '?string', preprocessed: 'boolean' }), (req, res, next) => {
    doCreate(req, res).catch(next);
});

router.use(csurf({ cookie: false }));

router.get('/', (req, res, next) => {
    const language = I18n.localeToLanguage(req.locale);

    db.withClient((dbClient) => {
        return stringModel.getAll(dbClient, language);
    }).then((rows) => {
        res.render('thingpedia_string_type_list', { page_title: req._("Thingpedia - String Types"),
                                                    csrfToken: req.csrfToken(),
                                                    stringTypes: rows });
    }).catch(next);
});

router.get('/download/:id', user.requireLogIn, (req, res, next) => {
    const language = I18n.localeToLanguage(req.locale);

    db.withClient(async (dbClient) => {
        try {
            const stringType = await stringModel.getByTypeName(dbClient, req.params.id, language);
            if (stringType.license === 'proprietary')
                throw new Error("This dataset is proprietary and cannot be downloaded directly. Contact the Thingpedia administrators directly to obtain it.");
        } catch(e) {
            res.status(e.code === 'ENOENT' ? 404 : 403);
            res.render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
            return;
        }

        await new Promise((resolve, reject) => {
            const query = stringModel.streamValues(dbClient, req.params.id, language);

            res.set('Content-Type', 'text/tab-separated-values');
            const writer = csv.stringify({ delimiter: '\t' });
            writer.pipe(res);

            query.on('result', (row) => {
                writer.write([row.value, row.preprocessed, row.weight]);
            });
            query.on('end', () => {
                writer.end();
                resolve();
            });
            query.on('error', reject);
            writer.on('error', reject);
        });
    }).catch(next);
});


module.exports = router;
