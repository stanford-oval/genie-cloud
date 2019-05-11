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
const { BadRequestError, ForbiddenError } = require('../util/errors');

var router = express.Router();

const NAME_REGEX = /([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_]*)/;

class StreamTokenizer extends stream.Transform {
    constructor(options) {
        super({ objectMode: true });

        this._language = options.language;
        this._preprocessed = options.preprocessed;
        this._typeId = options.typeId;
    }

    _transform(row, encoding, callback) {
        const value = row[0];
        let weight = parseFloat(row[1]) || 1.0;
        if (!(weight > 0.0))
            weight = 1.0;

        if (this._preprocessed) {
            callback(null, {
                type_id: this._typeId,
                value: value,
                preprocessed: value,
                weight: weight
            });
        } else {
            TokenizerService.tokenize(this._language, value).then((result) => {
                // ignore lines with uppercase (entity) tokens
                if (result.tokens.some((t) => /[A-Z]/.test(t))) {
                    callback(null);
                } else {
                    callback(null, {
                        type_id: this._typeId,
                        value: value,
                        preprocessed: result.tokens.join(' '),
                        weight: weight
                    });
                }
            }, (err) => callback(err));
        }
    }

    _flush(callback) {
        process.nextTick(callback);
    }
}

async function doCreate(req, res) {
    const language = I18n.localeToLanguage(req.locale);

    try {
        await db.withTransaction(async (dbClient) => {
            const match = NAME_REGEX.exec(req.body.type_name);
            if (match === null)
                throw new BadRequestError(req._("Invalid string type ID."));
            if (['public-domain', 'free-permissive', 'free-copyleft', 'non-commercial', 'proprietary'].indexOf(req.body.license) < 0)
                throw new BadRequestError(req._("Invalid license."));

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
                    throw new ForbiddenError(req._("The prefix of the dataset ID must correspond to the ID of a Thingpedia device owned by your organization."));
            }

            if (!req.files.upload || !req.files.upload.length)
                throw new BadRequestError(req._("You must upload a TSV file with the string values."));

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
            const transformer = new StreamTokenizer({
                preprocessed: !!req.body.preprocessed,
                language,
                typeId: stringType.id,
            });
            const writer = stringModel.insertValueStream(dbClient);
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
        const stringType = await stringModel.getByTypeName(dbClient, req.params.id, language);
        if (stringType.license === 'proprietary')
            throw new ForbiddenError("This dataset is proprietary and cannot be downloaded directly. Contact the Thingpedia administrators directly to obtain it.");

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
