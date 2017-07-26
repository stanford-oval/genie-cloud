// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;
const schema = require('../../model/schema');

// A copy of ThingTalk SchemaRetriever
// that uses schema.getDeveloperMetas instead of ThingpediaClient
// (and also ignore builtins)
module.exports = class SchemaRetriever {
    constructor(dbClient, language, parseTypes) {
        this._schemaRequest = null;
        this._pendingSchemaRequests = [];
        this._metaRequest = null;
        this._pendingMetaRequests = [];
        this._cache = {};
        this._metaCache = {};

        this._dbClient = dbClient;
        this._language = language;
        this._parseTypes = !!parseTypes;
    }

    _ensureMetaRequest() {
        if (this._metaRequest !== null)
            return;

        this._metaRequest = Q.delay(0).then(() => {
            var pending = this._pendingMetaRequests;
            this._pendingMetaRequests = [];
            this._metaRequest = null;
            console.log('Batched schema-meta request for ' + pending);
            return schema.getDeveloperMetas(this._dbClient, pending, this._language);
        }).then((rows) => {
            rows.forEach((row) => {
                if (this._parseTypes) {
                    this._parseMetaTypes(row.triggers);
                    this._parseMetaTypes(row.actions);
                    this._parseMetaTypes(row.queries);
                }
                this._metaCache[row.kind] = {
                    triggers: row.triggers,
                    actions: row.actions,
                    queries: row.queries
                };
            });
            return this._metaCache;
        });
    }

    _parseMetaTypes(channels) {
        for (var name in channels)
            channels[name].schema = channels[name].schema.map(ThingTalk.Type.fromString);
    }

    getFullMeta(kind) {
        if (kind in this._metaCache)
            return Q(this._metaCache[kind]);

        if (this._pendingMetaRequests.indexOf(kind) < 0)
            this._pendingMetaRequests.push(kind);
        this._ensureMetaRequest();
        return this._metaRequest.then(function(everything) {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        });
    }

    getMeta(kind, where, name) {
        return this.getFullMeta(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }

    _getFullSchema(kind) {
        if (typeof kind !== 'string')
            throw new TypeError();
        if (kind in this._cache)
            return Q(this._cache[kind]);

        if (this._pendingSchemaRequests.indexOf(kind) < 0)
            this._pendingSchemaRequests.push(kind);
        this._ensureSchemaRequest();
        return this._schemaRequest.then((everything) => {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        });
    }

    getSchemaAndNames(kind, where, name) {
        return this._getFullSchema(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }

    _ensureSchemaRequest() {
        if (this._schemaRequest !== null)
            return;

        this._schemaRequest = Q.delay(0).then(() => {
            var pending = this._pendingSchemaRequests;
            this._pendingSchemaRequests = [];
            this._schemaRequest = null;
            if (pending.length === 0)
                return {};
            if (!this._silent)
                console.log('Batched schema request for ' + pending);
            return schema.getDeveloperMetas(this._dbClient, pending, this._language);
        }).then((rows) => {
            rows.forEach((row) => {
                this._parseSchemaTypes(row, row.triggers);
                this._parseSchemaTypes(row, row.actions);
                this._parseSchemaTypes(row, row.queries);
                this._cache[row.kind] = {
                    triggers: row.triggers,
                    actions: row.actions,
                    queries: row.queries
                };
            });
            return this._cache;
        });
    }

    _parseSchemaTypes(schema, channels) {
        for (var name in channels) {
            channels[name].kind_type = schema.kind_type;
            channels[name].types = channels[name].schema.map(Type.fromString);
        }
    }
}
