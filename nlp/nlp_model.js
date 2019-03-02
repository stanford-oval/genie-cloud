// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const path = require('path');

const BaseThingpediaClient = require('../util/thingpedia-client');

const Predictor = require('./predictor');
const ExactMatcher = require('./exact');

const db = require('../util/db');

// A ThingpediaClient that operates under the credentials of a specific organization
class OrgThingpediaClient extends BaseThingpediaClient {
    constructor(locale, org) {
        super(null, locale);
        this._org = org;
    }

    async _getOrg() {
        return this._org;
    }
}

class DummyExactMatcher {
    load() {}

    get() {
        return null;
    }

    add() {}
}

module.exports = class NLPModel {
    constructor(locale, modelTag, owner, accessToken) {
        this.accessToken = accessToken;
        this.id = `@${modelTag}/${locale}`;
        this.locale = locale;

        if (modelTag === 'default')
            this.exact = new ExactMatcher(locale, modelTag);
        else
            this.exact = new DummyExactMatcher(); // non default models don't get any exact match

        const modeldir = path.resolve(`./${modelTag}:${locale}`);

        this.predictor = new Predictor(this.id, modeldir, { isDefault: modelTag === 'default' });

        const org = owner === null ? { is_admin: true, id: 1 } : { is_admin: false, id: owner };
        this.tpClient = new OrgThingpediaClient(locale, org);
    }

    destroy() {
        return this.predictor.stop();
    }

    reload() {
        return Promise.all([
            db.withClient((dbClient) => {
                return this.exact.load(dbClient);
            }),
            this.predictor.reload()
        ]);
    }

    load(dbClient) {
        return Promise.all([
            this.exact.load(dbClient),
            this.predictor.start()
        ]);
    }
};
