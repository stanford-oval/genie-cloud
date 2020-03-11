// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/mturk');

const MTurkUtils = require('../util/mturk');

var router = express.Router();

router.use(user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN));

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getBatches(dbClient);
    }).then((batches) => {
        res.render('admin_mturk_batch_list', {
            page_title: req._("Thingpedia - MTurk Batches"),
            batches: batches,
            csrfToken: req.csrfToken()
        });
    }).catch(next);
});

router.get('/csv/:batch', (req, res, next) => {
    db.withClient((dbClient) => {
        return MTurkUtils.getParaphrasingBatch(dbClient, req.params.batch, res);
    }).catch(next);
});

router.get('/validation/csv/:batch', (req, res, next) => {
    db.withClient((dbClient) => {
        return MTurkUtils.getValidationBatch(dbClient, req.params.batch, res);
    }).catch(next);
});


router.post('/start-validation', (req, res, next) => {
    db.withTransaction((dbClient) => {
        return MTurkUtils.startValidation(req, dbClient, req.body.batch);
    }).then(() => {
        res.redirect(303, '/admin/mturk');
    }).catch(next);
});

router.post('/close', (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        return MTurkUtils.closeBatch(dbClient, req.body.batch, !!req.body.autoapprove);
    }).then(() => {
        res.redirect(303, '/admin/mturk');
    }).catch(next);
});

module.exports = router;
