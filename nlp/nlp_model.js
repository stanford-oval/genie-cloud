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
const Genie = require('genie-toolkit');
const Tp = require('thingpedia');

const BaseThingpediaClient = require('../util/thingpedia-client');

const ExactMatcher = require('./exact');

const db = require('../util/db');

const Config = require('../config');

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
    async load() {}

    get() {
        return null;
    }

    add() {}
}

function isDefaultModel(modelTag) {
    switch (modelTag) {
    case 'org.thingpedia.models.default':
    case 'org.thingpedia.models.contextual':
    case 'org.thingpedia.models.developer':
    case 'org.thingpedia.models.developer.contextual':
        return true;
    default:
        return false;
    }
}

module.exports = class NLPModel {
    constructor(locale, modelTag, owner, accessToken) {
        this.accessToken = accessToken;
        this.id = `@${modelTag}/${locale}`;
        this.locale = locale;

        const isDefault = isDefaultModel(modelTag);
        if (isDefault)
            this.exact = new ExactMatcher(locale, modelTag);
        else
            this.exact = new DummyExactMatcher(); // non default models don't get any exact match

        const modeldir = path.resolve(`./${modelTag}:${locale}`);

        let nprocesses;
        if (isDefault && process.env.THINGENGINE_NUM_NLP_WORKERS)
            nprocesses = parseInt(process.env.THINGENGINE_NUM_NLP_WORKERS);
        else
            nprocesses = 1;
        this.predictor = new Genie.Predictor(this.id, modeldir, nprocesses);

        if (Config.WITH_THINGPEDIA === 'embedded') {
            const org = (owner === null || owner === 1) ? { is_admin: true, id: 1 } : { is_admin: false, id: owner };
            this.tpClient = new OrgThingpediaClient(locale, org);
        } else {
            this.tpClient = new Tp.HttpClient({
                getDeveloperKey() {
                    return Config.NL_THINGPEDIA_DEVELOPER_KEY;
                },
                locale: locale,
            }, Config.THINGPEDIA_URL);
        }
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
