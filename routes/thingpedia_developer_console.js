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
const lunr = require('lunr');
require("lunr-languages/lunr.stemmer.support")(lunr);

const db = require('../util/db');
const organization = require('../model/organization');
const device = require('../model/device');
const oauth2 = require('../model/oauth2');

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

router.get('/', (req, res, next) => {
    prepareUserInfo(req).then(([developer_org, developer_org_members, developer_devices, developer_oauth2_clients]) => {
        res.render('thingpedia_dev_overview', { page_title: req._("Thingpedia - Developer Portal"),
                                                csrfToken: req.csrfToken(),
                                                developer_org_name: developer_org.name,
                                                developer_org_members: developer_org_members,
                                                developer_devices: developer_devices,
                                                developer_oauth2_clients: developer_oauth2_clients
        });
    }).catch(next);
});

router.get('/oauth', (req, res, next) => {
    prepareUserInfo(req).then(([developer_org, developer_org_members, developer_devices, developer_oauth2_clients]) => {
        res.render('thingpedia_dev_oauth', { page_title: req._("Thingpedia - Oauth 2.0 Applications"),
                                             csrfToken: req.csrfToken(),
                                             developer_org_name: developer_org.name,
                                             developer_org_members: developer_org_members,
                                             developer_devices: developer_devices,
                                             developer_oauth2_clients: developer_oauth2_clients
        });
    }).catch(next);
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

const searchIndex = require('../doc/fts.json');
searchIndex.index = lunr.Index.load(searchIndex.index);
function highlightSearch(url, metadata) {
    const terms = [];
    let minIndex = Infinity;
    let maxIndex = -Infinity;
    for (let term in metadata) {
        if (metadata[term].content) {
            terms.push(term);
            for (let pos of metadata[term].content.position) {
                minIndex = Math.min(pos[0], minIndex);
                maxIndex = Math.max(pos[1]+pos[0], maxIndex);
            }
        }
    }
    
    const content = searchIndex.documents[url].content;
    if (!terms.length)
        return content;
    
    const trimLeft = minIndex > 10;
    
    const trimmedText = (trimLeft ? '...' : '') +
        content.substring(minIndex-10);
        
    return trimmedText.replace(new RegExp('\\b(?:' + terms.join('|') + ')\\b', 'ig'),
                               (w) => `<mark>${escape(w)}</mark>`);
}

router.get('/search', (req, res) => {
    if (!req.query.q) {
        res.status(400).json({ error: 'missing query' });
        return;
    }
    
    const results = searchIndex.index.search(req.query.q);
    const data = [];
    for (let i = 0; i < Math.min(5, results.length); i++) {
        const result = results[i];
        data.push({
            url: result.ref,
            score: result.score,
            highlight: highlightSearch(result.ref, result.matchData.metadata)
        });
    }
    
    res.cacheFor(86400);
    res.json({
        result: 'ok',
        data
    });
});

router.use('/thingpedia-api', express.static(path.join(__dirname, '../doc/thingpedia-api')));

module.exports = router;
