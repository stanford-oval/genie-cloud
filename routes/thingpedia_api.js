// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

const db = require('../util/db');
const device = require('../model/device');
const app = require('../model/app');
const user = require('../model/user');
const organization = require('../model/organization');

const ThingPediaClient = require('../util/thingpedia-client');

var router = express.Router();

router.get('/schema/:schemas', function(req, res) {
    var schemas = req.params.schemas.split(',');
    if (schemas.length === 0) {
        res.json({});
        return;
    }

    var client = new ThingPediaClient(req.query.developer_key);

    client.getSchemas(schemas).then(function(obj) {
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
    var client = new ThingPediaClient(req.query.developer_key);

    client.getDeviceCode(req.params.kind).then(function(code) {
        res.json(code);
    }).catch(function(e) {
        console.log('Failed to retrieve device code: ' + e.message);
        console.log(e.stack);
        res.status(400).send('Error: ' + e.message);
    }).done();
});

function deviceMakeFactory(d) {
    var ast = JSON.parse(d.code);

    delete d.code;
    if (ast.auth.type === 'builtin') {
        d.factory = null;
    } else if (ast.auth.type === 'none' &&
               Object.keys(ast.params).length === 0) {
        d.factory = ({ type: 'none', text: d.name });
    } else if (ast.auth.type === 'oauth2') {
        d.factory = ({ type: 'oauth2', text: d.name });
    } else {
        d.factory = ({ type: 'form',
                       fields: Object.keys(ast.params).map(function(k) {
                           var p = ast.params[k];
                           return ({ name: k, label: p[0], type: p[1] });
                       })
                     });
    }
}

router.get('/devices', function(req, res) {
    if (req.query.class && ['online', 'physical', 'data'].indexOf(req.query.class) < 0) {
        res.status(404).json("Invalid device class");
        return;
    }

    db.withClient(function(dbClient) {
        return Q.try(function() {
            var developerKey = req.query.developer_key;

            if (developerKey)
                return organization.getByDeveloperKey(dbClient, developerKey);
            else
                return [];
        }).then(function(orgs) {
            var org = null;
            if (orgs.length > 0)
                org = orgs[0];

            var devices;
            if (req.query.class) {
                if (req.query.class === 'online')
                    devices = device.getAllApprovedWithKindWithCode(dbClient,
                                                                    'online-account',
                                                                    org);
                else if (req.query.class === 'data')
                    devices = device.getAllApprovedWithKindWithCode(dbClient,
                                                                    'data-source',
                                                                    org);
                else
                    devices = device.getAllApprovedWithoutKindsWithCode(dbClient,
                                                                        ['online-account','data-source'],
                                                                        org);
            } else {
                devices = device.getAllApprovedWithCode(dbClient, org);
            }

            return devices.then(function(devices) {
                devices.forEach(function(d) {
                    try {
                        deviceMakeFactory(d);
                    } catch(e) {}
                });
                devices = devices.filter(function(d) {
                    return !!d.factory;
                });
                res.json(devices);
            });
        });
    }).done();
});

router.get('/code/apps/:id', function(req, res) {
    db.withClient(function(dbClient) {
        return app.get(dbClient, req.params.id).then(function(app) {
            if (!app.visible) {
                res.status(403).json({ error: "Not Authorized" });
            }

            res.cacheFor(86400000);
            res.status(200).json({
                code: app.code,
                name: app.name,
                description: app.description
            });
        });
    }).catch(function(e) {
        res.json({ error: e.message });
    });
});
router.post('/discovery', function(req, res) {
    var client = new ThingPediaClient(req.query.developer_key);

    client.getKindByDiscovery(req.body).then(function(result) {
        if (result === null) {
            res.status(404).send('Not Found');
            return;
        }

        res.status(200).send(result.primary_kind);
    }).catch(function(e) {
        console.log('Failed to complete discovery request: ' + e.message);
        console.log(e.stack);
        res.status(400).send('Error: ' + e.message);
    });
});

module.exports = router;
