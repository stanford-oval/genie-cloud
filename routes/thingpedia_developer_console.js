// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const express = require('express');
const path = require('path');

const db = require('../util/db');
const organization = require('../model/organization');
const device = require('../model/device');
const oauth2 = require('../model/oauth2');

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

function prepareUserInfo(req) {
    return Promise.resolve().then(() => {
        if (req.user && req.user.developer_org !== null) {
            return db.withClient((dbClient) => {
                return Q.all([
                    organization.get(dbClient, req.user.developer_org),
                    organization.getMembers(dbClient, req.user.developer_org),
                    device.getByOwner(dbClient, req.user.developer_org),
                    oauth2.getClientsByOwner(dbClient, req.user.developer_org)]);
            });
        } else {
            return [{}, [], []];
        }
    });
}

function prepareThingEngineStatus(req) {
    return Promise.resolve().then(() => {
        if (req.user)
            return EngineManager.get().isRunning(req.user.id);
        else
            return false;
    });
}

router.get('/', (req, res) => {
    prepareUserInfo(req).then(([developer_org, developer_org_members, developer_devices, developer_oauth2_clients]) => {
        res.render('thingpedia_dev_overview', { page_title: req._("Thingpedia - Developer Portal"),
                                                csrfToken: req.csrfToken(),
                                                developer_org_name: developer_org.name,
                                                developer_org_members: developer_org_members,
                                                developer_devices: developer_devices,
                                                developer_oauth2_clients: developer_oauth2_clients
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
});

router.get('/oauth', (req, res) => {
    prepareUserInfo(req).then(([developer_org, developer_org_members, developer_devices, developer_oauth2_clients]) => {
        res.render('thingpedia_dev_oauth', { page_title: req._("Thingpedia - Oauth 2.0 Applications"),
                                             csrfToken: req.csrfToken(),
                                             developer_org_name: developer_org.name,
                                             developer_org_members: developer_org_members,
                                             developer_devices: developer_devices,
                                             developer_oauth2_clients: developer_oauth2_clients
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
            message: e });
    });
});


router.get('/train', (req, res) => {
    res.render('thingpedia_dev_train_almond', { page_title: req._("Thingpedia - Train Almond"), csrfToken: req.csrfToken() });
});

router.get('/status', (req, res) => {
    res.redirect('/me/status');
});

for (let doc of require('../doc/doc-list.json')) {
    router.get('/' + doc + '.md', (req, res, next) => {
        res.render('doc_' + doc, {
            page_title: req._("Thingpedia - Documentation"),
            currentPage: doc
        });
    });
}

router.use('/thingpedia-api', express.static(path.join(__dirname, '../doc/thingpedia-api')));

module.exports = router;
