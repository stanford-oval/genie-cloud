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

const db = require('./db');
const schema = require('../model/schema');

const BaseThingpediaClient = require('./thingpedia-client');

// A ThingpediaClient that always operates as admin, reading
// the full database
module.exports = class AdminThingpediaClient extends BaseThingpediaClient {
    constructor(locale, dbClient) {
        super(null, locale);

        this._dbClient = dbClient;
    }

    _withClient(callback) {
        if (this._dbClient)
            return callback(this._dbClient);
        else
            return db.withClient(callback);
    }

    getSchemas(schemas) {
        return this._withClient((dbClient) =>
            schema.getTypesAndNamesByKinds(dbClient, schemas, -1)
        ).then((rows) => {
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
    }

    getMetas(schemas) {
        return this._withClient((dbClient) =>
            schema.getMetasByKinds(dbClient, schemas, -1, this.language)
        ).then((rows) => {
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
    }
};
