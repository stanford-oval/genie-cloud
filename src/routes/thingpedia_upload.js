// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
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
import * as os from 'os';

import * as db from '../util/db';
import * as model from '../model/device';
import * as exampleModel from '../model/example';

import * as Importer from '../util/import_device';
import * as DatasetUtils from '../util/dataset';
import * as iv from '../util/input_validation';
import * as user from '../util/user';
import { ValidationError, BadRequestError, ForbiddenError } from '../util/errors';

let router = express.Router();

router.use(multer({ dest: os.tmpdir() }).fields([
    { name: 'zipfile', maxCount: 1 },
    { name: 'icon', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));
router.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});
router.use(user.requireLogIn, user.requireDeveloper());

router.get('/create', (req, res) => {
    res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - Create New Device"),
                                                     device: { code: '',
                                                               dataset: '' },
                                                     create: true });
});

async function doCreateOrUpdate(kind, create, req, res) {
    if (create)
        kind = req.body.primary_kind;
    else
        req.body.primary_kind = kind;

    try {
        await Importer.uploadDevice(req);
    } catch(e) {
        if (!(e instanceof ValidationError) && !(e instanceof BadRequestError))
            throw e;

        console.error(e.stack);
        res.render('thingpedia_device_create_or_edit', { page_title:
                                                         (create ?
                                                          req._("Thingpedia - Create New Device") :
                                                          req._("Thingpedia - Edit Device")),
                                                         error: e,
                                                         device: req.body,
                                                         create: create });
        return;
    }

    res.redirect('/thingpedia/devices/by-id/' + kind);
}

const updateArguments = {
    name: 'string',
    description: 'string',
    license: 'string',
    license_gplcompatible: 'boolean',
    website: '?string',
    repository: '?string',
    issue_tracker: '?string',
    subcategory: 'string',
    code: 'string',
    dataset: 'string',
    approve: 'boolean'
};
const createArguments = {};
Object.assign(createArguments, updateArguments);
createArguments.primary_kind = 'string';

router.post('/create', iv.validatePOST(createArguments), (req, res, next) => {
    doCreateOrUpdate(undefined, true, req, res).catch(next);
});

router.get('/update/:kind', (req, res, next) => {
    Promise.resolve().then(() => {
        return db.withClient(async (dbClient) => {
            const d = await model.getByPrimaryKind(dbClient, req.params.kind, true);
            if (d.owner !== req.user.developer_org &&
                (req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0)
                throw new ForbiddenError();

            const [code, examples] = await Promise.all([
                d.source_code || model.getCodeByVersion(dbClient, d.id, d.developer_version),
                exampleModel.getBaseBySchemaKind(dbClient, d.primary_kind, 'en')
            ]);

            const dataset = await DatasetUtils.examplesToDataset(d.primary_kind, 'en', examples,
                                                                 { editMode: true });

            res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - Edit Device"),
                                                             id: d.id,
                                                             device: { name: d.name,
                                                                       primary_kind: d.primary_kind,
                                                                       description: d.description,
                                                                       subcategory: d.subcategory,
                                                                       website: d.website,
                                                                       license: d.license,
                                                                       license_gplcompatible: d.license_gplcompatible,
                                                                       repository: d.repository,
                                                                       issue_tracker: d.issue_tracker,
                                                                       code: code,
                                                                       dataset: dataset },
                                                             create: false });
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).catch(next);
});

router.post('/update/:kind', iv.validatePOST(updateArguments), (req, res, next) => {
    doCreateOrUpdate(req.params.kind, false, req, res).catch(next);
});

export default router;
