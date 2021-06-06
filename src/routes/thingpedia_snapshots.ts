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

import * as user from '../util/user';
import * as snapshot from '../model/snapshot';
import * as db from '../util/db';
import * as iv from '../util/input_validation';

const router = express.Router();

router.get('/', iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page : number;
    if (req.query.page === undefined)
        page = 0;
    else
        page = parseInt(req.query.page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return snapshot.getAll(dbClient, page * 20, 21);
    }).then((rows) => {
        res.render('thingpedia_snapshot_list', { page_title: req._("Thingpedia - List of Snapshots"),
                                                 csrfToken: req.csrfToken(),
                                                 page_num: page,
                                                 snapshots: rows });
    }).catch(next);
});

router.post('/create',
    user.requireLogIn, user.requireRole(user.Role.THINGPEDIA_ADMIN),
    iv.validatePOST({ description: '?string' }),
    (req, res, next) => {
    db.withTransaction((dbClient) => {
        const obj = {
            description: req.body.description || '',
            date: new Date
        };
        return snapshot.create(dbClient, obj);
    }).then(() => {
        res.redirect(303, '/thingpedia/snapshots');
    }).catch(next);
});

export default router;
