// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const express = require('express');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/example');
const iv = require('../util/input_validation');

const router = express.Router();
router.use(user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN));

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getTypes(dbClient);
    }).then((rows) => {
        res.render('luinet_dataset_list', {
            page_name: req._("LUInet - Datasets"),
            datasets: rows
        });
    }).catch(next);
});

router.get('/:language/:type', iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    const RESULTS_PER_PAGE = 50;

    db.withClient((dbClient) => {
        return model.getByType(dbClient, req.params.language, req.params.type, page * RESULTS_PER_PAGE, RESULTS_PER_PAGE+1);
    }).then((rows) => {
        res.render('luinet_dataset', {
            page_name: req._("LUInet - Dataset: %s/%s").format(req.params.language, req.params.type),
            language: req.params.language,
            type: req.params.type,
            dataset: rows,
            page_num: page,
            csrfToken: req.csrfToken(),
            RESULTS_PER_PAGE,
        });
    }).catch(next);
});

module.exports = router;
