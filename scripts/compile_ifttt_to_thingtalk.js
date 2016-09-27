// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const byline = require('byline');

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const schema = require('../model/schema');
const exampleModel = require('../model/example');
const SempreSyntax = require('../util/sempre_syntax');

// A copy of ThingTalk SchemaRetriever
// that uses schema.getDeveloperMetas instead of ThingPediaClient
// (and also ignore builtins)
class SchemaRetriever {
    constructor(dbClient, language) {
        this._metaRequest = null;
        this._pendingMetaRequests = [];
        this._metaCache = {};

        this._dbClient = dbClient;
        this._language = language;
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
                this._parseMetaTypes(row.triggers);
                this._parseMetaTypes(row.actions);
                this._parseMetaTypes(row.queries);
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

    _getFullMeta(kind) {
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
        return this._getFullMeta(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }
}

var _schemaRetriever;

function compileOne(line, output) {
    var [ifttt, thingtalk] = line.split(/\t+/);
    return Q.try(function() {
        var sempre = SempreSyntax.toSEMPRE(thingtalk);
        return SempreSyntax.verify(_schemaRetriever, sempre).then(function() {
            return JSON.stringify(sempre);
        });
    }).then(function(json) {
        output.write(ifttt + '\t' + json + '\n');
    }).catch(function(e) {
        console.log('Failed to compile ' + ifttt + ': ' + e);
    });
}

function main() {
    var input = byline(fs.createReadStream(process.argv[2]));
    input.setEncoding('utf8');
    var output = fs.createWriteStream(process.argv[3]);
    output.setDefaultEncoding('utf8');

    var promises = [];

    db.connect().then(([dbClient, done]) => {
        _schemaRetriever = new SchemaRetriever(dbClient, 'en-US');
        var promises = [];
        input.on('data', function(line) {
            promises.push(compileOne(line, output));
        });
        input.on('end', function() { Q.all(promises).then(() => output.end()); });
        output.on('finish', function() { process.exit() });
    });
}
main();
