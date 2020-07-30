// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const entityModel = require('../../model/entity');
const stringModel = require('../../model/strings');

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
                name: e.entity_name,
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
