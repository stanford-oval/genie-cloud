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

const db = require('../util/db');
const deviceModel = require('../model/device');
const schemaModel = require('../model/schema');
const entityModel = require('../model/entity');
const commandModel = require('../model/example');

const ThingpediaClient = require('../util/thingpedia-client');
const ImageCacheManager = require('../util/cache_manager');
const { tokenize } = require('../util/tokenize');

const Config = require('../config');
const Bing = require('node-bing-api')({ accKey: Config.BING_KEY });

const everything = express.Router();

const v1 = express.Router();
const v2 = express.Router();

// NOTES on versioning
//
// The whole API is exposed under /thingpedia/api/vX
//
// Any time an endpoint is changed incompatibly, make a
// copy of the endpoint and mount it under the newer vN
//
// To add a new endpoint, add it to the new vN only
// To remove an endpoint, add it to the vN with
// `next('router')` as the handler: this will cause the
// vN router to be skipped, failing back to the handler
// for / at the top (which returns 404)

v1.get('/schema/:schemas', (req, res) => {
    var schemas = req.params.schemas.split(',');
    if (schemas.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getSchemas(schemas).then((obj) => {
        // don't cache if the use is a developer
        if (!req.query.developer_key)
            res.cacheFor(86400000);
        res.json(obj);
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).send('Error: ' + e.message);
    }).done();
});

v1.get('/schema-metadata/:schemas', (req, res) => {
    var schemas = req.params.schemas.split(',');
    if (schemas.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getMetas(schemas).then((obj) => {
        // don't cache if the use is a developer
        if (!req.query.developer_key)
            res.cacheFor(86400000);
        res.json(obj);
    }).catch((e) => {
        res.status(400).send('Error: ' + e.message);
    }).done();
});

v1.get('/code/devices/:kind', (req, res) => {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.getDeviceCode(req.params.kind).then((code) => {
        if (code.developer)
            res.cacheFor(3600000);
        else
            res.cacheFor(86400000);
        res.json(code);
    }).catch((e) => {
        res.status(400).send('Error: ' + e.message);
    });
});

v1.get('/devices/setup/:kinds', (req, res) => {
    var kinds = req.params.kinds.split(',');
    if (kinds.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getDeviceSetup2(kinds).then((result) => {
        for (let name in result) {
            if (result[name].type === 'multiple')
                result[name].choices = result[name].choices.map((c) => c.text);
        }
        return result;
    }).then((result) => {
        res.cacheFor(86400000);
        res.status(200).json(result);
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

v1.get('/devices/setup/:kinds', (req, res) => {
    var kinds = req.params.kinds.split(',');
    if (kinds.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getDeviceSetup2(kinds).then((result) => {
        res.cacheFor(86400000);
        res.status(200).json(result);
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

v1.get('/devices/icon/:kind', (req, res) => {
    // cache for forever, this redirect will never expire
    res.cacheFor(6, 'months');

    if (req.query.style && /^[0-9]+$/.test(req.query.style)
        && req.query.style >= 1 && req.query.style <= 8)
       res.redirect(301, Config.S3_CLOUDFRONT_HOST + '/icons/style-' + req.query.style + '/' + req.params.kind + '.png');
    else
       res.redirect(301, Config.S3_CLOUDFRONT_HOST + '/icons/' + req.params.kind + '.png');
});

v1.get('/devices', (req, res, next) => {
    if (req.query.class && ['online', 'physical', 'data', 'system',
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
    }).catch(next);
});

v1.get('/devices/all', (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    else
        page = parseInt(page);
    if (!isFinite(page) || page < 0)
        page = 0;
    let page_size = req.query.page_size;
    if (page_size === undefined)
        page_size = 10;
    else
        page_size = parseInt(page_size);
    if (!isFinite(page_size) || page_size < 0)
        page_size = 10;
    if (page_size > 10)
        page_size = 10;
    if (req.query.class && ['online', 'physical', 'data', 'system',
            'media', 'social-network', 'home', 'communication',
            'health', 'service', 'data-management'].indexOf(req.query.class) < 0) {
        res.status(404).json("Invalid device class");
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);
    client.getDeviceList(req.query.class || null, page, page_size).then((obj) => {
        res.cacheFor(86400000);
        res.json(obj);
    }).catch((e) => {
        console.error('Failed to retrieve device list: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).catch(next);
});

v1.get('/devices/search', (req, res) => {
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

function getCommandDetails(client, commands) {
    let promisesAll = commands.map((command) => {
        // get device kinds from target_code
        let functions = command.target_code.split(' ').filter((code) => code.startsWith('@'));
        let devices = functions.map((f) => {
            let device_name = f.split('.');
            device_name.splice(-1, 1);
            return device_name.join('.').substr(1);
        });
        // deduplicate
        command.devices = devices.filter((device, pos) => devices.indexOf(device) === pos);

        // get device names
        command.deviceNames = [];
        let promises = command.devices.map((device) => {
            return deviceModel.getByAnyKind(client, device).then((devices) => {
                command.deviceNames.push(devices[0].name);
            });
        });

        return promises;
    });
    return Promise.all([].concat.apply([], promisesAll));
}

v1.get('/commands/all', (req, res) => {
    const language = (req.query.locale || 'en').split(/[-_@.]/)[0];
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    else
        page = parseInt(page);
    if (!isFinite(page) || page < 0)
        page = 0;
    let page_size = req.query.page_size;
    if (page_size === undefined)
        page_size = 9;
    else
        page_size = parseInt(page_size);
    if (!isFinite(page_size) || page_size < 0)
        page_size = 9;
    if (page_size > 9)
        page_size = 9;

    db.withTransaction((client) => {
        return commandModel.getCommands(client, language, page * page_size, page_size).then((commands) => {
            return getCommandDetails(client, commands).then(() => {
                res.cacheFor(3600 * 1000);
                res.json({ data: commands });
            });
        });
    }).catch((e) => {
        console.error('Failed to retrieve command list: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).done();
});

v1.get('/commands/search', (req, res) => {
    const language = (req.query.locale || 'en').split(/[-_@.]/)[0];
    let q = req.query.q;
    if (!q) {
        res.status(300).json({ error: 'missing query' });
        return;
    }

    db.withTransaction((client) => {
        return commandModel.getCommandsByFuzzySearch(client, language, q).then((commands) => {
            return getCommandDetails(client, commands).then(() => {
                res.cacheFor(3600 * 1000);
                res.json({ data: commands });
            });
        });
    }).catch((e) => {
        console.error('Failed to retrieve command list: ' + e.message);
        console.error(e.stack);
        res.status(500).send('Error: ' + e.message);
    }).done();
});


v1.get('/apps', (req, res) => {
    // deprecated endpoint
    res.json([]);
});
v2.get('/apps', (req, res, next) => next('router'));

v1.get('/code/apps/:app_id', (req, res) => {
    // deprecated endpoint, respond with 410 Gone
    res.status(410).send('This end point no longer exists');
});
v2.get('/code/apps/:app_id', (req, res, next) => next('router'));

v1.post('/discovery', (req, res) => {
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

v1.get('/examples/by-kinds/:kinds', (req, res) => {
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

v1.get('/examples', (req, res) => {
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

v1.get('/examples/click/:id', (req, res) => {
    var client = new ThingpediaClient(req.query.developer_key, req.query.locale);

    client.clickExample(req.params.id).then(() => {
        res.cacheFor(300000);
        res.status(200).json({ result: 'ok' });
    }, (e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

v1.get('/entities', (req, res) => {
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

v1.get('/entities/lookup', (req, res) => {
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

v1.get('/entities/lookup/:type', (req, res) => {
    const language = (req.query.locale || 'en').split(/[-_@.]/)[0];
    const token = req.query.q;

    if (!token) {
        res.status(400).json({ error: 'Missing query' });
        return;
    }
    
    db.withClient((dbClient) => {
        return Promise.all([entityModel.lookupWithType(dbClient, language, req.params.type, token),
                            entityModel.get(dbClient, req.params.type, language)]);
    }).then(([rows, meta]) => {
        res.cacheFor(86400000);
        res.status(200).json({
            result: 'ok',
            meta: { name: meta.name, has_ner_support: meta.has_ner_support, is_well_known: meta.is_well_known },
            data: rows.map((r) => ({ type: r.entity_id, value: r.entity_value, canonical: r.entity_canonical, name: r.entity_name }))
        });
    }).catch((e) => {
        if (e.message === `Wrong number of rows returned, expected 1, got 0`)
            res.status(404).json({ error: "Invalid entity type" });
        else
            res.status(500).json({ error: e.message });
    }).done();
});

v1.get('/entities/list/:type', (req, res) => {
    return db.withClient((dbClient) => {
        return entityModel.getValues(dbClient, req.params.type);
    }).then((rows) => {
        res.cacheFor(86400000);
        res.status(200).json({ result: 'ok', data: rows.map((r) => ({ id: r.entity_value, name: r.entity_name })) });
    }).catch((e) => {
        res.status(500).json({ error: e.message });
    }).done();
});

v1.get('/entities/icon', (req, res) => {
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

v1.get('/snapshot/:id', (req, res) => {
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

// all endpoints that have not been overridden in v2 use the v1 version
v2.use('/', v1);

everything.use('/v1', v1);
everything.use('/v2', v2);

// for compatibility with the existing code, v1 is also exposed unversioned
everything.use('/', v1);

// if nothing handled the route, return a 404
everything.use('/', (req, res) => {
    res.status(404).json({ error: 'Invalid endpoint' });
});

module.exports = everything;
