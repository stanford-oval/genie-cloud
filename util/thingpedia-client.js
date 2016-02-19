// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const lang = require('lang');

const ThingPediaDiscovery = require('thingpedia-discovery');

const db = require('./db');
const device = require('../model/device');
const user = require('../model/user');
const schema = require('../model/schema');

const S3_HOST = 'https://d3hpoqf2ntov6o.cloudfront.net/devices/';

const LEGACY_MAPS = {
    'linkedin': 'com.linkedin',
    'bodytrace-scale': 'com.bodytrace.scale',
    'twitter-account': 'com.twitter',
    'google-account': 'com.google',
    'facebook': 'com.facebook'
};

const ThingPediaDiscoveryDatabase = new lang.Class({
    Name: 'ThingPediaDiscoveryDatabase',

    _init: function() {},

    getByAnyKind: function(kind) {
        return db.withClient(function(dbClient) {
            return device.getByAnyKind(dbClient, kind);
        });
    },

    getAllKinds: function(deviceId) {
        return db.withClient(function(dbClient) {
            return device.getAllKinds(dbClient, deviceId);
        });
    },

    getByPrimaryKind: function(kind) {
        return db.withClient(function(dbClient) {
            return device.getByPrimaryKind(dbClient, kind);
        });
    }
});

var _discoveryServer = new ThingPediaDiscovery.Server(new ThingPediaDiscoveryDatabase());

module.exports = new lang.Class({
    Name: 'ThingPediaClientCloud',
    $rpcMethods: ['getModuleLocation', 'getDeviceCode',
                  'getSchemas', 'getKindByDiscovery'],

    _init: function(developerKey) {
        this.developerKey = developerKey;
    },

    getModuleLocation: function(kind) {
        if (kind in LEGACY_MAPS)
            kind = LEGACY_MAPS[kind];

        var developerKey = this.developerKey;

        return db.withClient(function(dbClient) {
            return Q.try(function() {
                if (developerKey)
                    return user.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then(function(developers) {
                var developer = null;
                if (developers.length > 0)
                    developer = developers[0];

                return device.getByPrimaryKind(dbClient, kind)
                    .then(function(device) {
                        if (device.fullcode)
                            throw new Error('No Code Available');

                        if (developer !== null && developer.id === device.owner)
                            return (S3_HOST + device.primary_kind + '-v' + device.developer_version + '.zip');
                        else if (device.approved_version !== null)
                            return (S3_HOST + device.primary_kind + '-v' + device.approved_version + '.zip');
                        else
                            throw new Error('Not Authorized');
                    });
            });
        });
    },

    getDeviceCode: function(kind) {
        if (kind in LEGACY_MAPS)
            kind = LEGACY_MAPS[kind];

        var developerKey = this.developerKey;

        return db.withClient(function(dbClient) {
            return Q.try(function() {
                if (developerKey)
                    return user.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then(function(developers) {
                var developer = null;
                if (developers.length > 0)
                    developer = developers[0];

                return device.getFullCodeByPrimaryKind(dbClient, kind, developer)
                    .then(function(devs) {
                        if (devs.length < 1)
                            throw new Error('Not Found');

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
        });
    },

    getSchemas: function(schemas) {
        var developerKey = this.developerKey;

        return db.withClient(function(dbClient) {
            return Q.try(function() {
                if (developerKey)
                    return user.getByDeveloperKey(dbClient, developerKey);
                else
                    return [];
            }).then(function(developers) {
                var developer = null;
                if (developers.length > 0)
                    developer = developers[0];

                return schema.getTypesByKinds(dbClient, schemas, developer).then(function(rows) {
                    var obj = {};

                    rows.forEach(function(row) {
                        if (row.types === null)
                            return;
                        obj[row.kind] = {
                            triggers: row.types[0],
                            actions: row.types[1]
                        };
                    });

                    return obj;
                });
            });
        });
    },

    getKindByDiscovery: function(body) {
        return _discoveryServer.decode(body);
    }
});
