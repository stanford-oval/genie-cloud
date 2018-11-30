// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/example');

const router = express.Router();

router.get('/', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    db.withClient((dbClient) => {
        return model.getTypes(dbClient);
    }).then((rows) => {
        res.render('thingpedia_dataset_list', {
            page_name: req._("Thingpedia - Datasets"),
            datasets: rows
        });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
});

router.get('/:language/:type', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
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
        res.render('thingpedia_dataset', {
            page_name: req._("Thingpedia - Dataset: %s/%s").format(req.params.language, req.params.type),
            language: req.params.language,
            type: req.params.type,
            dataset: rows,
            page_num: page,
            csrfToken: req.csrfToken(),
            RESULTS_PER_PAGE,
        });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
});

module.exports = router;
