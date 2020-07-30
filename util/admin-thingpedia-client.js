// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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

const BaseThingpediaClient = require('./thingpedia-client');

// A ThingpediaClient that always operates as admin, reading
// the full database
module.exports = class AdminThingpediaClient extends BaseThingpediaClient {
    constructor(locale, dbClient) {
        super(null, locale, dbClient);
    }

    async _getOrg() {
        return { is_admin: true, id: 1 };
    }
};
