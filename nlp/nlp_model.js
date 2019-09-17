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

const Genie = require('genie-toolkit');
const Tp = require('thingpedia');

const BaseThingpediaClient = require('../util/thingpedia-client');
const AbstractFS = require('../util/abstract_fs');

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

const nprocesses = 1;

module.exports = class NLPModel {
    constructor(spec, service) {
        this.id = `@${spec.tag}/${spec.language}`;

        this._localdir = null;
        this.init(spec, service);
    }

    init(spec, service) {
        this.accessToken = spec.access_token;
        this.tag = spec.tag;
        this.locale = spec.language;
        this.trained = spec.trained;

        if (spec.use_exact)
            this.exact = service.getExact(spec.language);
        else
            this.exact = new DummyExactMatcher(); // non default models don't get any exact match

        this._modeldir = AbstractFS.resolve(Config.NL_MODEL_DIR, `./${spec.tag}:${spec.language}`);

        if (Config.WITH_THINGPEDIA === 'embedded') {
            const org = (spec.owner === null || spec.owner === 1) ? { is_admin: true, id: 1 } : { is_admin: false, id: spec.owner };
            this.tpClient = new OrgThingpediaClient(spec.language, org);
        } else {
            this.tpClient = new Tp.HttpClient({
                getDeveloperKey() {
                    return Config.NL_THINGPEDIA_DEVELOPER_KEY;
                },
                locale: spec.language,
            }, Config.THINGPEDIA_URL);
        }
    }

    async _download() {
        this._localdir = await AbstractFS.download(this._modeldir + '/');
    }

    async destroy() {
        return Promise.all([
            this.predictor.stop(),
            AbstractFS.removeTemporary(this._localdir)
        ]);
    }

    async reload() {
        if (!this.trained)
            return;

        const oldlocaldir = this._localdir;
        await this._download();

        const oldpredictor = this.predictor;
        this.predictor = new Genie.Predictor(this.id, this._localdir, nprocesses);
        await this.predictor.start();

        await Promise.all([
            oldpredictor ? oldpredictor.stop() : Promise.resolve(),
            oldlocaldir ? AbstractFS.removeTemporary(oldlocaldir) : Promise.resolve()
        ]);
    }

    async load() {
        if (!this.trained)
            return;

        await this._download();
        this.predictor = new Genie.Predictor(this.id, this._localdir, nprocesses);
        await this.predictor.start();
    }
};
