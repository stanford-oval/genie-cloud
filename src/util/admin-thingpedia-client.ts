// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as db from './db';
import BaseThingpediaClient from './thingpedia-client';

// A ThingpediaClient that always operates as admin, reading
// the full database
export default class AdminThingpediaClient extends BaseThingpediaClient {
    private _onlyApproved : boolean;

    constructor(locale : string, dbClient : db.Client|null, onlyApproved = false) {
        super(null, locale, undefined, dbClient);
        this._onlyApproved = onlyApproved;
    }

    async _getOrg() {
        if (this._onlyApproved)
            return null;
        else
            return { is_admin: true, id: 1 };
    }
}
