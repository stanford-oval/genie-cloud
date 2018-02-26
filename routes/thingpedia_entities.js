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

const Q = require('q');
const express = require('express');

const db = require('../util/db');
const model = require('../model/entity');

var router = express.Router();

router.get('/', (req, res) => {
    db.withClient((dbClient) => {
        return model.getAll(dbClient);
    }).then((rows) => {
        res.render('thingpedia_entity_list', { page_title: req._("Thingpedia - Entity Types"),
                                               entities: rows });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/by-id/:id', (req, res) => {
    db.withClient((dbClient) => {
        return Q.all([model.get(dbClient, req.params.id), model.getValues(dbClient, req.params.id)]);
    }).then(([entity, values]) => {
        res.render('thingpedia_entity_values', { page_title: req._("Thingpedia - Entity Values"),
                                                 entity: entity,
                                                 values: values });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
