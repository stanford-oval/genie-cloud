// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const ThingPediaDiscovery = require('thingpedia-discovery');

const db = require('./db');
const device = require('../model/device');
const user = require('../model/user');
const organization = require('../model/organization');
const schema = require('../model/schema');

const S3_HOST = 'https://d1ge76rambtuys.cloudfront.net/devices/';

const LEGACY_MAPS = {
    'linkedin': 'com.linkedin',
    'bodytrace-scale': 'com.bodytrace.scale',
    'twitter-account': 'com.twitter',
    'google-account': 'com.google',
    'facebook': 'com.facebook'
};

class ThingPediaDiscoveryDatabase {
    getByAnyKind(kind) {
        return db.withClient(function(dbClient) {
            return device.getByAnyKind(dbClient, kind);
        });
    }

    getAllKinds(deviceId) {
        return db.withClient(function(dbClient) {
            return device.getAllKinds(dbClient, deviceId);
        });
    }

    getByPrimaryKind(kind) {
        return db.withClient(function(dbClient) {
            return device.getByPrimaryKind(dbClient, kind);
        });
    }
}

var _discoveryServer = new ThingPediaDiscovery.Server(new ThingPediaDiscoveryDatabase());

module.exports = class ThingPediaClientCloud {
    constructor(developerKey) {
        this.developerKey = developerKey;
    }

    getModuleLocation(kind) {
        if (kind in LEGACY_MAPS)
            kind = LEGACY_MAPS[kind];

        var developerKey = this.developerKey;

        return db.withClient(function(dbClient) {
            return Q.try(function() {
                if (developerKey)
                    return organization.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then(function(orgs) {
                var org = null;
                if (orgs.length > 0)
                    org = orgs[0];

                return device.getByPrimaryKind(dbClient, kind).then(function(device) {
                    if (device.fullcode)
                        throw new Error('No Code Available');

                    if (org !== null && org.id === device.owner)
                        return (S3_HOST + device.primary_kind + '-v' + device.developer_version + '.zip');
                    else if (device.approved_version !== null)
                        return (S3_HOST + device.primary_kind + '-v' + device.approved_version + '.zip');
                    else
                        throw new Error('Not Authorized');
                });
            });
        });
    }

    getDeviceCode(kind) {
        if (kind in LEGACY_MAPS)
            kind = LEGACY_MAPS[kind];

        var developerKey = this.developerKey;

        return db.withClient(function(dbClient) {
            return Q.try(function() {
                if (developerKey)
                    return organization.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then(function(orgs) {
                var org = null;
                if (orgs.length > 0)
                    org = orgs[0];

                return device.getFullCodeByPrimaryKind(dbClient, kind, org);
            }).then(function(devs) {
                if (devs.length < 1)
                    throw new Error(kind + ' not Found');

                var dev = devs[0];
                var ast = JSON.parse(dev.code);
                ast.version = dev.version;
                if (dev.version !== dev.approved_version)
                    ast.developer = true;
                else
                    ast.developer = false;

                return ast;
            });
        });
    }

    getSchemas(schemas) {
        var developerKey = this.developerKey;

        return db.withClient(function(dbClient) {
            return Q.try(function() {
                if (developerKey)
                    return organization.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then(function(orgs) {
                var org = null;
                if (orgs.length > 0)
                    org = orgs[0];

                return schema.getTypesByKinds(dbClient, schemas, org);
            }).then(function(rows) {
                var obj = {};

                rows.forEach(function(row) {
                    if (row.types === null)
                        return;
                    obj[row.kind] = {
                        triggers: row.types[0],
                        actions: row.types[1],
                        queries: (row.types[2] || {})
                    };
                });

                return obj;
            });
        });
    }

    getMetas(schemas) {
        var developerKey = this.developerKey;

        return db.withClient(function(dbClient) {
            return Q.try(function() {
                if (developerKey)
                    return organization.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then(function(orgs) {
                var org = null;
                if (orgs.length > 0)
                    org = orgs[0];

                return schema.getMetasByKinds(dbClient, schemas, org);
            }).then(function(rows) {
                var obj = {};

                rows.forEach(function(row) {
                    if (row.types === null)
                        return;

                    var types = { triggers: {}, queries: {}, actions: {} };

                    function doOne(what, id) {
                        for (var name in row.types[id]) {
                            var obj = {
                                schema: row.types[id][name]
                            };
                            if (name in row.meta[id]) {
                                obj.args = row.meta[id][name].args;
                                obj.label = row.meta[id][name].label || row.meta[id][name].doc;
                                obj.doc = obj.label;
                                obj.canonical = row.meta[id][name].canonical || '';
                                obj.questions = row.meta[id][name].questions || [];
                            } else {
                                obj.args = obj.schema.map(function(_, i) {
                                    return 'arg' + (i+1);
                                });
                                obj.label = name;
                                obj.doc = name;
                                obj.canonical = name;
                                obj.questions = obj.schema.map(function() {
                                    return '';
                                });
                            }
                            types[what][name] = obj;
                        }
                    }

                    doOne('triggers', 0);
                    doOne('actions', 1);
                    doOne('queries', 2);
                    obj[row.kind] = types;
                });

                return obj;
            });
        });
    }

    _deviceMakeFactory(d) {
        var ast = JSON.parse(d.code);

        delete d.code;
        if (ast.auth.type === 'builtin') {
            d.factory = null;
        } else if (ast.auth.type === 'none' &&
                   Object.keys(ast.params).length === 0) {
            d.factory = ({ type: 'none', kind: d.primary_kind, text: d.name });
        } else if (ast.auth.type === 'oauth2') {
            d.factory = ({ type: 'oauth2', kind: d.primary_kind, text: d.name });
        } else {
            d.factory = ({ type: 'form', kind: d.primary_kind,
                           fields: Object.keys(ast.params).map(function(k) {
                               var p = ast.params[k];
                               return ({ name: k, label: p[0], type: p[1] });
                           })
                         });
        }
    }

    getDeviceFactories(klass) {
        var developerKey = this.developerKey;

        return db.withClient((dbClient) => {
            return Q.try(() => {
                if (developerKey)
                    return organization.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then((orgs) => {
                var org = null;
                if (orgs.length > 0)
                    org = orgs[0];

                var devices;
                if (klass) {
                    if (klass === 'online')
                        devices = device.getAllApprovedWithKindWithCode(dbClient,
                                                                        'online-account',
                                                                        org);
                    else if (klass === 'data')
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

                return devices.then((devices) => {
                    devices.forEach((d) => {
                        try {
                            this._deviceMakeFactory(d);
                        } catch(e) {}
                    });
                    devices = devices.filter((d) => {
                        return !!d.factory;
                    });
                    res.json(devices);
                });
            });
        });
    }

    getDeviceSetup(kinds) {
        var developerKey = this.developerKey;
        var result = {};

        return db.withClient((dbClient) => {
            return Q.try(() => {
                if (developerKey)
                    return organization.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then((orgs) => {
                var org = null;
                if (orgs.length > 0)
                    org = orgs[0];

                return device.getApprovedByGlobalNamesWithCode(dbClient, kinds, org);
            }).then((devices) => {
                devices.forEach((d) => {
                    try {
                        this._deviceMakeFactory(d);
                        if (d.factory)
                            result[d.global_name] = d.factory;
                    } catch(e) {}
                });

                var unresolved = kinds.filter((k) => !(k in result));
                return Q.all(unresolved.map((k) => {
                    return device.getAllWithKindOrChildKind(dbClient, k).then((devices) => {
                        result[k] = {
                            type: 'multiple',
                            choices: devices.map((d) => d.name)
                        };
                    });
                }));
            });
        }).then(() => {
            return result;
        });
    }

    getKindByDiscovery(body) {
        return _discoveryServer.decode(body);
    }
}
module.exports.prototype.$rpcMethods = ['getModuleLocation', 'getDeviceCode',
                                        'getSchemas', 'getMetas',
                                        'getDeviceSetup',
                                        'getKindByDiscovery'];
