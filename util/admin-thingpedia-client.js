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
