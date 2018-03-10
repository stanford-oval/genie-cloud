// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const express = require('express');
const csv = require('csv');
const crypto = require('crypto');

const db = require('../util/db');
const device = require('../model/device');
const app = require('../model/app');
const user = require('../model/user');
const deviceModel = require('../model/device');
const schemaModel = require('../model/schema');
const entityModel = require('../model/entity');

const ThingTalk = require('thingtalk');
const SchemaRetriever = ThingTalk.SchemaRetriever;

const ThingpediaClient = require('../util/thingpedia-client');
const i18n = require('../util/i18n');
const ImageCacheManager = require('../util/cache_manager');
const { tokenize } = require('../util/tokenize');

const Config = require('../config');
const Bing = require('node-bing-api')({ accKey: Config.BING_KEY });

var router = express.Router();

router.get('/schema/:schemas', (req, res) => {
    var schemas = req.params.schemas.split(',');
    if (schemas.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getSchemas(schemas, req.query.version).then((obj) => {
        if (obj.developer)
            res.cacheFor(3600000);
        else
            res.cacheFor(86400000);
        res.json(obj);
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).send('Error: ' + e.message);
    }).done();
});

router.get('/schema-metadata/:schemas', (req, res) => {
    var schemas = req.params.schemas.split(',');
    if (schemas.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getMetas(schemas).then((obj) => {
        if (obj.developer)
            res.cacheFor(3600000);
        else
            res.cacheFor(86400000);
        res.json(obj);
    }).catch((e) => {
        res.status(400).send('Error: ' + e.message);
    }).done();
});

router.get('/code/devices/:kind', (req, res) => {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getDeviceCode(req.params.kind, req.query.version).then((code) => {
        if (code.developer)
            res.cacheFor(3600000);
        else
            res.cacheFor(86400000);
        res.json(code);
    }).catch((e) => {
        res.status(400).send('Error: ' + e.message);
    }).done();
});

router.get('/devices/setup/:kinds', (req, res) => {
    var kinds = req.params.kinds.split(',');
    if (kinds.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getDeviceSetup(kinds).then((result) => {
        res.cacheFor(86400000);
        res.status(200).json(result);
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/devices/icon/:kind', (req, res) => {
    res.redirect(301, Config.S3_CLOUDFRONT_HOST + '/icons/' + req.params.kind + '.png');
});

router.get('/devices', (req, res) => {
    if (req.query.class && ['online', 'physical', 'data',
            'media', 'social-network', 'home', 'communication',
            'health', 'service', 'data-management'].indexOf(req.query.class) < 0) {
        res.status(404).json("Invalid device class");
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getDeviceFactories(req.query.class).then((obj) => {
        res.cacheFor(86400000);
        res.json(obj);
    }).catch((e) => {
        console.error('Failed to retrieve device factories: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).done();
});

router.get('/devices/all', (req, res) => {
    var page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return deviceModel.getAll(dbClient, page * 9, 10);
    }).then((devices) => {
        var kinds = new Set;
        devices = devices.filter((d) => {
            if (kinds.has(d.primary_kind))
                return false;
            kinds.add(d.primary_kind);
            return true;
        });
        res.cacheFor(86400000);
        res.json({ devices });
    }).catch((e) => {
        console.error('Failed to retrieve device list: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).done();
});

router.get('/devices/search', (req, res) => {
    var q = req.query.q;
    if (!q) {
        res.status(300).json({ error: 'missing query' });
        return;
    }

    db.withClient((dbClient) => {
        return deviceModel.getByFuzzySearch(dbClient, q);
    }).then((devices) => {
        var kinds = new Set;
        devices = devices.filter((d) => {
            if (kinds.has(d.primary_kind))
                return false;
            kinds.add(d.primary_kind);
            return true;
        });
        res.cacheFor(86400000);
        res.json({ devices });
    }).catch((e) => {
        console.error('Failed to retrieve device list: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).done();
});

router.get('/apps', (req, res) => {
    var start = parseInt(req.query.start) || 0;
    var limit = Math.min(parseInt(req.query.limit) || 20, 20);

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getApps(start, limit).then((obj) => {
        res.cacheFor(86400000);
        res.json(obj);
    }).catch((e) => {
        console.error('Failed to retrieve device factories: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).done();
});

router.get('/code/apps/:app_id', (req, res) => {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getAppCode(req.params.app_id).then((obj) => {
        res.cacheFor(86400000);
        res.status(200).json(obj);
    }).catch((e) => {
        res.status(400).send('Error: ' + e.message);
    }).done();
});
router.post('/discovery', (req, res) => {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getKindByDiscovery(req.body).then((result) => {
        if (result === null) {
            res.status(404).send('Not Found');
            return;
        }

        res.cacheFor(86400000);
        res.status(200).send(result.primary_kind);
    }).catch((e) => {
        console.log('Failed to complete discovery request: ' + e.message);
        console.log(e.stack);
        res.status(400).send('Error: ' + e.message);
    });
});

router.get('/examples/by-kinds/:kinds', (req, res) => {
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

router.get('/examples', (req, res) => {
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

router.get('/examples/click/:id', (req, res) => {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.clickExample(req.params.id).then(() => {
        res.cacheFor(300000);
        res.status(200).json({ result: 'ok' });
    }, (e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/entities', (req, res) => {
    const snapshotId = parseInt(req.query.snapshot);
    const etag = `"snapshot-${snapshotId}"`;
    if (snapshotId >= 0 && req.headers['if-none-match'] === etag) {
        res.set('ETag', etag);
        res.status(304).send('');
        return;
    }

    db.withClient((dbClient) => {
        if (snapshotId >= 0)
            return entityModel.getSnapshot(dbClient, snapshotId);
        else
            return entityModel.getAll(dbClient);
    }).then((rows) => {
        if (rows.length > 0 && snapshotId >= 0) {
            res.cacheFor(6, 'months');
            res.set('ETag', etag);
        } else {
            res.cacheFor(86400000);
        }
        res.status(200).json({ result: 'ok', data: rows.map((r) => ({
            type: r.id,
            name: r.name,
            is_well_known: r.is_well_known,
            has_ner_support: r.has_ner_support
        })) });
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/entities/lookup', (req, res) => {
    const language = (req.query.locale || 'en').split(/[-_@.]/)[0];
    const token = req.query.q;

    if (!token) {
        res.status(400).json({ error: 'Missing query' });
        return;
    }
    
    db.withClient((dbClient) => {
        return entityModel.lookup(dbClient, language, token);
    }).then((rows) => {
        res.cacheFor(86400000);
        res.status(200).json({ result: 'ok', data: rows.map((r) => ({ type: r.entity_id, value: r.entity_value, canonical: r.entity_canonical, name: r.entity_name })) });
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/entities/list/:type', (req, res) => {
    return db.withClient((dbClient) => {
        return entityModel.getValues(dbClient, req.params.type);
    }).then((rows) => {
        res.cacheFor(86400000);
        res.status(200).json({ result: 'ok', data: rows.map((r) => ({ id: r.entity_value, name: r.entity_name })) });
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/entities/icon', (req, res) => {
    const cacheManager = ImageCacheManager.get();
    const entityValue = req.query.entity_value;
    const entityType = req.query.entity_type;
    const entityDisplay = req.query.entity_display || null;
    if (entityType === 'tt:email_address' || entityType === 'tt:phone_number') {
        let cacheKey = 'contact:' + (entityType === 'tt:phone_number' ? 'phone' : 'email') + ':' + entityValue;
        let cached = cacheManager.get(cacheKey);
        if (cached)
            res.redirect(301, '/cache/' + cached);
        else
            res.redirect(301, '/cache/8b0db4cadaa2c66cc139bdea50da5891b0c87435.png');
            //res.status(404).send('Not Found');
    } else {
        let cacheKey = entityType + ':' + entityValue;
        let cached = cacheManager.get(cacheKey);
        if (cached) {
            res.redirect(301, '/cache/' + cached);
            return;
        }

        let searchTerm = tokenize(entityDisplay || entityValue).join(' ');
        if (entityType === 'tt:iso_lang_code')
            searchTerm += ' flag';
        else
            searchTerm += ' logo png transparent';

        Q.ninvoke(Bing, 'images', searchTerm, { count: 1, offset: 0 }).then(([res, body]) => {
            return cacheManager.cache(cacheKey, body.value[0].contentUrl);
        }).then((filename) => {
            res.redirect(301, '/cache/' + filename);
        }).catch((e) => {
            res.status(500).send(e.message);
        });
    }
});

router.get('/snapshot/:id', (req, res) => {
    const getMeta = req.query.meta === '1';
    const language = (req.query.locale || 'en').split(/[-_@.]/)[0];
    const snapshotId = parseInt(req.params.id);
    const etag = `"snapshot-${snapshotId}-meta:${getMeta}-lang:${language}"`;
    if (snapshotId >= 0 && req.headers['if-none-match'] === etag) {
        res.set('ETag', etag);
        res.status(304).send('');
        return;
    }

    db.withClient((dbClient) => {
        if (snapshotId >= 0) {
            if (getMeta)
                return schemaModel.getSnapshotMeta(dbClient, snapshotId, language);
            else
                return schemaModel.getSnapshotTypes(dbClient, snapshotId);
        } else {
            if (getMeta)
                return schemaModel.getCurrentSnapshotMeta(dbClient, language);
            else
                return schemaModel.getCurrentSnapshotTypes(dbClient);
        }
    }).then((rows) => {
        if (rows.length > 0 && snapshotId >= 0) {
            res.cacheFor(6, 'months');
            res.set('ETag', etag);
        } else {
            res.cacheFor(3600000);
        }
        res.status(200).json({ result: 'ok', data: rows });
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/random-rule', (req, res) => {
    const locale = req.query.locale || 'en-US';
    const language = (locale || 'en').split(/[-_@.]/)[0];

    const N = Math.min(parseInt(req.query.limit) || 20, 20);

    const policy = req.query.policy || 'uniform';
    const client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    const schemaRetriever = new SchemaRetriever(client);

    return db.withClient((dbClient) => {
        return db.selectAll(dbClient, "select kind from device_schema where approved_version is not null and kind_type <> 'global'", []);
    }).then((rows) => {
        let kinds = rows.map((r) => r.kind);

        let stream = ThingTalk.Generate.genRandomRules(kinds, schemaRetriever, N, {
            applyHeuristics: true,
            allowUnsynthesizable: false,
            strictParameterPassing: true,
            samplingPolicy: policy,
            actionArgConstantProbability: 0.7,
            argConstantProbability: 0.3,
            requiredArgConstantProbability: 0.9,
            applyFiltersToInputs: false,
            filterClauseProbability: 0.3
        });

        res.status(200).set('Content-Type', 'application/json');

        res.write('[');
        var first = true;
        stream.on('data', (prog) => {
            if (!first)
                res.write(',');
            first = false;
            res.write(JSON.stringify(ThingTalk.Ast.prettyprint(prog, true)));
        });
        stream.on('error', (err) => {
            console.error('Error generating one rule: ' + err.message);
        });
        stream.on('end', () => {
            res.write(']');
            res.end();
        });
    }, (e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

router.get('/random-rule/by-kind/:kind', (req, res) => {
    const locale = req.query.locale || 'en-US';
    const language = (locale || 'en').split(/[-_@.]/)[0];
    const gettext = i18n.get(locale);
    const N = Math.min(parseInt(req.query.limit) || 150, 150);
    const policy = 'only-' + req.params.kind;
    const client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    const sentences_per_hit = 3;

    function makeId() { return crypto.randomBytes(8).toString('hex'); }
    function postprocess(str) { return str.replace(/your/g, 'my').replace(/ you /g, ' I '); }

    const schemaRetriever = new SchemaRetriever(client);

    return db.withClient((dbClient) => {
        return db.selectAll(dbClient, "select kind from device_schema where approved_version is not null and kind_type <> 'global'", []);
    }).then((rows) => {
        let kinds = rows.map((r) => r.kind);

        let stream = ThingTalk.Generate.genRandomRules(kinds, schemaRetriever, N, {
            applyHeuristics: true,
            allowUnsynthesizable: false,
            strictParameterPassing: true,
            samplingPolicy: policy,
            actionArgConstantProbability: 0.7,
            argConstantProbability: 0.3,
            requiredArgConstantProbability: 0.9,
            applyFiltersToInputs: false,
            filterClauseProbability: 0.3
        });

        res.set('Content-disposition', 'attachment; filename=synthetic_sentences_for_turk.csv');
        res.status(200).set('Content-Type', 'text/csv');
        let output = csv.stringify();
        output.pipe(res);
        let headers = [];
        for (var i = 1; i <= 3; i ++)
            headers = headers.concat(['id' + i, 'thingtalk' + i, 'sentence' + i]);
        output.write(headers);

        let row = [];
        stream.on('data', (prog) => {
            const reconstructed = ThingTalk.Describe.describeProgram(gettext, prog, true);
            const tt = ThingTalk.Ast.prettyprint(prog, true).trim();
            row = row.concat([makeId(), tt, postprocess(reconstructed)]);
            if (row.length === sentences_per_hit * 3) {
                output.write(row);
                row = [];
            }
        });
        stream.on('error', (err) => {
            console.error('Error generating one rule: ' + err.message);
        });
        stream.on('end', () => {
            output.end();
        });
    }, (e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

module.exports = router;
