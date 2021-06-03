// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
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
import * as entityModel from '../model/entity';
import * as user from '../util/user';
import * as iv from '../util/input_validation';
import { uploadEntities } from '../util/upload_dataset';

const router = express.Router();

router.post('/create', multer({ dest: os.tmpdir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }),
    user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ entity_id: 'string', entity_name: 'string', no_ner_support: 'boolean' }), (req, res, next) => {
    uploadEntities(req).then(() => {
        res.redirect(303, '/thingpedia/entities');
    }).catch(next);
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

export default router;
