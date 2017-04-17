// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

const db = require('../util/db');
const device = require('../model/device');
const user = require('../model/user');
const organization = require('../model/organization');

const ThingTalk = require('thingtalk');
const AppCompiler = ThingTalk.Compiler;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const ThingpediaClient = require('../util/thingpedia-client');
const genRandomRules = require('../util/gen_random_rule');

var router = express.Router();

router.get('/schema/:schemas', function(req, res) {
    var schemas = req.params.schemas.split(',');
    if (schemas.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getSchemas(schemas).then(function(obj) {
        if (obj.developer)
            res.cacheFor(3600000);
        else
            res.cacheFor(86400000);
        res.json(obj);
    }).catch(function(e) {
        console.error(e.stack);
        res.status(400).send('Error: ' + e.message);
    }).done();
});

router.get('/schema-metadata/:schemas', function(req, res) {
    var schemas = req.params.schemas.split(',');
    if (schemas.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getMetas(schemas).then(function(obj) {
        if (obj.developer)
            res.cacheFor(3600000);
        else
            res.cacheFor(86400000);
        res.json(obj);
    }).catch(function(e) {
        res.status(400).send('Error: ' + e.message);
    }).done();
});

router.get('/code/devices/:kind', function(req, res) {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getDeviceCode(req.params.kind).then(function(code) {
        if (code.developer)
            res.cacheFor(3600000);
        else
            res.cacheFor(86400000);
        res.json(code);
    }).catch(function(e) {
        res.status(400).send('Error: ' + e.message);
    }).done();
});

router.get('/devices/setup/:kinds', function(req, res) {
    var kinds = req.params.kinds.split(',');
    if (kinds.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getDeviceSetup(kinds).then(function(result) {
        res.cacheFor(86400000);
        res.status(200).json(result);
    }).catch(function(e) {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/devices', function(req, res) {
    if (req.query.class && ['online', 'physical', 'data',
            'media', 'social-network', 'home', 'communication',
            'health', 'service', 'data-management'].indexOf(req.query.class) < 0) {
        res.status(404).json("Invalid device class");
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getDeviceFactories(req.query.class).then(function(obj) {
        res.cacheFor(86400000);
        res.json(obj);
    }).catch(function(e) {
        console.error('Failed to retrieve device factories: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).done();
});

router.post('/discovery', function(req, res) {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getKindByDiscovery(req.body).then(function(result) {
        if (result === null) {
            res.status(404).send('Not Found');
            return;
        }

        res.cacheFor(86400000);
        res.status(200).send(result.primary_kind);
    }).catch(function(e) {
        console.log('Failed to complete discovery request: ' + e.message);
        console.log(e.stack);
        res.status(400).send('Error: ' + e.message);
    });
});

router.get('/examples/by-kinds/:kinds', function(req, res) {
    var kinds = req.params.kinds.split(',');
    if (kinds.length === 0) {
        res.json([]);
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    var isBase = req.query.base !== '0';

    client.getExamplesByKinds(kinds, isBase).then((result) => {
        res.cacheFor(300000);
        res.status(200).json(result);
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    });
});

router.get('/examples', function(req, res) {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    var isBase = req.query.base !== '0';

    if (req.query.key) {
        client.getExamplesByKey(req.query.key, isBase).then((result) => {
            res.cacheFor(300000);
            res.status(200).json(result);
        }).catch((e) => {
            res.status(500).json({ error: e.message });
        });
    } else {
        res.status(400).json({ error: "Bad Request" });
    }
});

router.get('/examples/click/:id', function(req, res) {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.clickExample(req.params.id).then(() => {
        res.cacheFor(300000);
        res.status(200).json({ result: 'ok' });
    }, (e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/random-rule', function(req, res) {
    var locale = req.query.locale || 'en-US';
    var language = (locale || 'en').split(/[-_\@\.]/)[0];

    var N = Math.min(parseInt(req.query.limit) || 20, 20);

    var policy = req.query.policy || 'uniform';
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    return db.withClient((dbClient) => {
        var schemaRetriever = new SchemaRetriever(client);
        return genRandomRules(dbClient, schemaRetriever, policy, language, N);
    }).then((rules) => {
        res.status(200).json(rules);
    }, (e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

module.exports = router;
