// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import express from 'express';
import multer from 'multer';
import csurf from 'csurf';
import csvstringify from 'csv-stringify';
import * as os from 'os';

import * as db from '../util/db';
import * as stringModel from '../model/strings';
import * as user from '../util/user';
import * as I18n from '../util/i18n';
import * as iv from '../util/input_validation';
import { ForbiddenError } from '../util/errors';
import { uploadStringDataset } from '../util/upload_dataset';

const router = express.Router();

router.post('/create', multer({ dest: os.tmpdir() }).single('upload'), csurf({ cookie: false }), user.requireLogIn, user.requireDeveloper(),
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

        await new Promise<void>((resolve, reject) => {
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


export default router;
