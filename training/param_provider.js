// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const entityModel = require('../model/entity');
const stringModel = require('../model/strings');

module.exports = class DatabaseParameterProvider {
    constructor(language, dbClient) {
        this._language = language;
        this._dbClient = dbClient;
    }

    async _getStrings(stringType) {
        return stringModel.getValues(this._dbClient, stringType, this._language);
    }

    async _getEntities(entityType) {
        const rows = await entityModel.getValues(this._dbClient, entityType, this._language);
        return rows.map((e) => {
            return {
                preprocessed: e.entity_canonical,
                weight: 1.0
            };
        });
    }

    get(valueListType, valueListName) {
        switch (valueListType) {
        case 'string':
            return this._getStrings(valueListName);
        case 'entity':
            return this._getEntities(valueListName);
        default:
            throw new TypeError(`Unexpected value list type ${valueListType}`);
        }
    }
};
