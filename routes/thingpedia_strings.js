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

const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const csvstringify = require('csv-stringify');
const os = require('os');

const db = require('../util/db');
const stringModel = require('../model/strings');
const user = require('../util/user');
const I18n = require('../util/i18n');
const iv = require('../util/input_validation');
const { ForbiddenError } = require('../util/errors');
const { uploadStringDataset } = require('../util/upload_dataset');

const router = express.Router();

router.post('/create', multer({ dest: os.tmpdir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }), user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ type_name: 'string', name: 'string', license: 'string', attribution: '?string', preprocessed: 'boolean' }), (req, res, next) => {
    uploadStringDataset(req).then(() => {
        res.redirect(303, './');
    }).catch(next);
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
            const writer = csvstringify({ delimiter: '\t' });
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
