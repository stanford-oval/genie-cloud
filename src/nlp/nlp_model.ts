// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as path from 'path';
import * as Genie from 'genie-toolkit';
import * as Tp from 'thingpedia';

import BaseThingpediaClient from '../util/thingpedia-client';
import * as AbstractFS from '../util/abstract_fs';
import * as localfs from '../util/local_fs';
import * as i18n from '../util/i18n';

import * as Config from '../config';

import type { NLPInferenceServer } from './main';

// A ThingpediaClient that operates under the credentials of a specific organization
class OrgThingpediaClient extends BaseThingpediaClient {
    private _org : { id : number, is_admin : boolean }|null;

    constructor(locale : string, org : { id : number, is_admin : boolean }|null) {
        super(null, locale);
        this._org = org;
    }

    async _getOrg() {
        return this._org;
    }
}

class DummyPreferences extends Tp.Preferences {
    keys() {
        return [];
    }

    get(key : string) {
        return undefined;
    }

    set<T>(key : string, value : T) : T {
        return value;
    }
}

/**
 * A stubbed-out Tp.BasePlatform implementation to be able to use Tp.HttpClient.
 */
class DummyPlatform extends Tp.BasePlatform {
    private _locale : string;
    private _prefs : DummyPreferences;

    constructor(locale : string) {
        super();
        this._locale = locale;
        this._prefs = new DummyPreferences;
    }

    get locale() {
        return this._locale;
    }

    get type() {
        return 'dummy';
    }

    get timezone() {
        return 'UTC';
    }

    getDeveloperKey() {
        return Config.NL_THINGPEDIA_DEVELOPER_KEY;
    }

    getSharedPreferences() {
        return this._prefs;
    }

    hasCapability() {
        return false;
    }

    getCapability() {
        return null;
    }

    getTmpDir() {
        return localfs.getTmpDir();
    }

    getCacheDir() {
        return localfs.getCacheDir();
    }

    getWritableDir() {
        return localfs.getWritableDir();
    }
}

export default class NLPModel {
    private _url : string;
    private _localdir : string|null;
    accessToken : string|undefined;
    locale : string;
    languageTag : string;
    contextual : boolean;
    exact : Genie.ExactMatcher;
    private _platform : DummyPlatform;
    tpClient : Tp.BaseClient;
    predictor ! : Genie.ParserClient.ParserClient;

    constructor(spec : {
        locale : string,
        owner : number|undefined,
        model_url : string,
        access_token : string|undefined,
        contextual : boolean,
    }, service : NLPInferenceServer) {
        this._url = spec.model_url;
        this._localdir = null;

        this.accessToken = spec.access_token;
        this.locale = spec.locale;
        this.languageTag = i18n.localeToLanguage(spec.locale);
        this.contextual = spec.contextual;
        this.exact = service.exact;

        this._platform = new DummyPlatform(spec.locale);

        if (Config.WITH_THINGPEDIA === 'embedded') {
            const org = (spec.owner === undefined || spec.owner === 1) ? { is_admin: true, id: 1 } : { is_admin: false, id: spec.owner };
            this.tpClient = new OrgThingpediaClient(this.languageTag, org);
        } else {
            this.tpClient = new Tp.HttpClient(this._platform, Config.THINGPEDIA_URL);
        }
    }

    async destroy() {
        await this.predictor.stop();
        if (this._localdir)
            await AbstractFS.removeTemporary(this._localdir);
    }

    async load() {
        /*
         * There are five types of URLs we support:
         *
         * - kf+http(s): use KFServing to host the genienlp model
         * - http(s): delegate to another NLP server (useful to log all requests without hosting a model)
         * - file: local model, running genienlp directly
         * - s3: download the model from S3, then run genienlp directly
         * - relative URLs, resolved based on NL_MODEL_DIR
         *
         * The last two are handled by AbstractFS, downloading to a temporary directory if needed.
         */

        let url = this._url;
        if (!/^(kf\+)?https?:/.test(url)) {
            const modeldir = AbstractFS.resolve(Config.NL_MODEL_DIR, url);
            this._localdir = path.resolve(await AbstractFS.download(modeldir + '/'));
            url = 'file://' + this._localdir;
        }
        this.predictor = Genie.ParserClient.get(url, this.locale, this._platform,
            this.exact, this.tpClient);
        await this.predictor.start();
    }
}
