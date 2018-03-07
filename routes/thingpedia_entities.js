// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const passport = require('passport');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/entity');
const Validation = require('../util/validation');
const generateExamples = require('../util/generate_examples');
const ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

router.get('/', (req, res) => {
    db.withClient((dbClient) => {
        return model.getAll(dbClient);
    }).then((rows) => {
        res.render('thingpedia_entity_list', { page_title: req._("Thingpedia - Entity Types"),
                                               entities: rows });
    }).catch(function(e) {
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
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
})

module.exports = router;
