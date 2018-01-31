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

const ThingpediaDiscovery = require('thingpedia-discovery');

const Config = require('../config');

const db = require('./db');
const device = require('../model/device');
const user = require('../model/user');
const organization = require('../model/organization');
const schema = require('../model/schema');
const exampleModel = require('../model/example');
const app = require('../model/app');

const S3_HOST = Config.S3_CLOUDFRONT_HOST + '/devices/';

const LEGACY_MAPS = {
    'linkedin': 'com.linkedin',
    'bodytrace-scale': 'com.bodytrace.scale',
    'twitter-account': 'com.twitter',
    'google-account': 'com.google',
    'facebook': 'com.facebook'
};

class ThingpediaDiscoveryDatabase {
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

var _discoveryServer = new ThingpediaDiscovery.Server(new ThingpediaDiscoveryDatabase());

const CATEGORIES = new Set(['media', 'social-network', 'home', 'communication', 'health', 'service', 'data-management']);

module.exports = class ThingpediaClientCloud {
    constructor(developerKey, locale) {
        this.developerKey = developerKey;
        // only keep the language part of the locale, we don't
        // yet distinguish en_US from en_GB
        this.language = (locale || 'en').split(/[-_\@\.]/)[0];
    }

    getAppCode(appId) {
        return db.withClient((dbClient) => {
            return app.getByAppId(dbClient, appId);
        });
    }

    getApps(start, limit) {
        return db.withClient((dbClient) => {
            return app.getAllQuick(dbClient, start, limit);
        });
    }

    getModuleLocation(kind, version) {
        if (kind in LEGACY_MAPS)
            kind = LEGACY_MAPS[kind];

        if (version)
            return Q(S3_HOST + kind + '-v' + version + '.zip');

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

                    if (org !== null && ((org.id === device.owner) || org.is_admin))
                        return (S3_HOST + device.primary_kind + '-v' + device.developer_version + '.zip');
                    else if (device.approved_version !== null)
                        return (S3_HOST + device.primary_kind + '-v' + device.approved_version + '.zip');
                    else
                        throw new Error('Not Authorized');
                });
            });
        });
    }

    getDeviceCode(kind, apiVersion) {
        if (kind in LEGACY_MAPS)
            kind = LEGACY_MAPS[kind];

        var developerKey = this.developerKey;
        var newApi = apiVersion >= 2;

        if (!newApi)
            return Q.reject(new Error('API version 1 is no longer supported'));

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

                return device.getFullCodeByPrimaryKind(dbClient, kind, org, newApi);
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

    getSchemas(schemas, apiVersion) {
        var developerKey = this.developerKey;
        apiVersion = apiVersion || 1;
        if (apiVersion < 2)
            return Q.reject(new Error('API version 1 is no longer supported'));

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
                return schema.getTypesAndNamesByKinds(dbClient, schemas, org !== null ? (org.is_admin ? -1 : org.id) : null);
            }).then(function(rows) {
                var obj = {};

                rows.forEach(function(row) {
                    obj[row.kind] = {
                        kind_type: row.kind_type,
                        triggers: row.triggers,
                        actions: row.actions,
                        queries: row.queries
                    };
                });

                return obj;
            });
        });
    }

    getMetas(schemas) {
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

                return schema.getMetasByKinds(dbClient, schemas, org !== null ? (org.is_admin ? -1 : org.id) : null, this.language);
            }).then((rows) => {
                var obj = {};

                rows.forEach((row) => {
                    obj[row.kind] = {
                        kind_type: row.kind_type,
                        triggers: row.triggers,
                        actions: row.actions,
                        queries: row.queries
                    };
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
        } else if (ast.auth.type === 'discovery') {
            d.factory = ({ type: 'discovery', kind: d.primary_kind, text: d.name,
                           discoveryType: ast.auth.discoveryType });
        } else if (ast.auth.type === 'none' &&
                   Object.keys(ast.params).length === 0) {
            d.factory = ({ type: 'none', kind: d.primary_kind, text: d.name });
        } else if (ast.auth.type === 'oauth2') {
            d.factory = ({ type: 'oauth2', kind: d.primary_kind, text: d.name });
        } else {
            d.factory = ({ type: 'form', kind: d.primary_kind, text: d.name,
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
                    if (['online','physical','data','system'].indexOf(klass) >= 0)
                        devices = device.getByCategory(dbClient, klass, org);
                    else if (CATEGORIES.has(klass))
                        devices = device.getBySubcategory(dbClient, klass, org);
                    else
                        devices = Q.reject(new Error("Invalid class parameter"));
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
                    return devices;
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
                        if (d.factory) {
                            if (d.global_name)
                                result[d.global_name] = d.factory;
                            result[d.primary_kind] = d.factory;
                        }
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

    getExamplesByKey(key, isBase) {
        return db.withClient((dbClient) => {
            return exampleModel.getByKey(dbClient, isBase, key, this.language);
        });
    }

    getExamplesByKinds(kinds, isBase) {
        return db.withClient((dbClient) => {
            return exampleModel.getByKinds(dbClient, isBase, kinds, this.language);
        });
    }

    clickExample(exampleId) {
        return db.withClient((dbClient) => {
            return exampleModel.click(dbClient, exampleId);
        });
    }
}
module.exports.prototype.$rpcMethods = ['getAppCode', 'getApps',
                                        'getModuleLocation', 'getDeviceCode',
                                        'getSchemas', 'getMetas',
                                        'getDeviceSetup', 'getDeviceFactories',
                                        'getKindByDiscovery',
                                        'getExamplesByKinds', 'getExamplesByKey',
                                        'clickExample'];
