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
const schemaModel = require('../model/schema');
const user = require('../util/user');

var router = express.Router();

router.get('/', (req, res) => {
    db.withClient((dbClient) => {
        return model.getAll(dbClient);
    }).then((rows) => {
        res.render('thingpedia_entity_list', { page_title: req._("Thingpedia - Entity Types"),
                                               csrfToken: req.csrfToken(),
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

const NAME_REGEX = /([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_]*)/;

router.post('/create', user.requireLogIn, user.requireDeveloper(), (req, res) => {
    db.withTransaction((dbClient) => {
        let match = NAME_REGEX.exec(req.body.entity_id);
        if (match === null)
            throw new Error('Invalid entity type ID');
        if (!req.body.entity_name)
            throw new Error('Invalid entity name');

        let [, prefix, /*suffix*/] = match;

        return Promise.resolve().then(() => {
            if (req.user.developer_status < user.DeveloperStatus.ADMIN) {
                return schemaModel.getByKind(dbClient, prefix).then((row) => {
                    if (row.owner !== req.user.developer_org) throw new Error();
                }).catch((e) => {
                    console.log('err', e.message);
                    throw new Error('The prefix of the entity ID must correspond to the ID of a Thingpedia device owned by your organization');
                });
            } else {
                return Promise.resolve();
            }
        }).then(() => {
            return model.create(dbClient, {
                name: req.body.entity_name,
                id: req.body.entity_id,
                is_well_known: false,
                has_ner_support: false
            });
        });
    }).then(() => {
        res.redirect(303, '/thingpedia/entities');
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
