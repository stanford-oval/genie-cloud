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

import express from 'express';

import * as db from '../util/db';

const router = express.Router();

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return Promise.all([
            db.selectOne(dbClient, `select count(*) as device_count from device_class where approved_version is not null`),
            db.selectOne(dbClient, `select count(*) as function_count from device_schema, device_schema_channels where schema_id = id and version = approved_version`),
        ]);
    }).then(([{device_count},{function_count}]) => {
        res.render('thingpedia_portal', { page_title: req._("Thingpedia - The Open API Collection"),
            csrfToken: req.csrfToken(), device_count, function_count });
    }).catch(next);
});

router.get('/training', (req, res, next) => {
    res.redirect(301, '/developers/train#sentence-to-code-block');
});

export default router;
