// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const os = require('os');

const db = require('../util/db');
const entityModel = require('../model/entity');
const user = require('../util/user');
const iv = require('../util/input_validation');
const { uploadEntities } = require('../util/upload_dataset');

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

module.exports = router;
