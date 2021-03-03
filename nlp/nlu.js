// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

const db = require('../util/db');
const exampleModel = require('../model/example');

function isValidDeveloperKey(developerKey) {
    return developerKey && developerKey !== 'null' && developerKey !== 'undefined';
}

async function runNLU(query, params, data, service, res) {
    const store = data.store || 'no';
    if (store !== 'yes' && store !== 'no') {
        res.status(400).json({ error: 'Invalid store parameter' });
        return undefined;
    }
    const expect = data.expect || null;

    let modelTag = params.model_tag;
    let model;
    if (modelTag) {
        model = service.getModel(modelTag, params.locale);
        if (!model || !model.trained) {
            res.status(404).json({ error: 'No such model' });
            return undefined;
        }

        if (model.contextual && !data.context) {
            data.context = 'null';
            data.entities = {};
        } else if (!model.contextual) {
            data.context = undefined;
            data.entities = undefined;
        }
    } else {
        let fallbacks;
        if (isValidDeveloperKey(data.developer_key)) {
            if (data.context) {
                fallbacks = ['org.thingpedia.models.developer.contextual', 'org.thingpedia.models.contextual',
                             'org.thingpedia.models.developer', 'org.thingpedia.models.default'];
            } else {
                fallbacks = ['org.thingpedia.models.developer', 'org.thingpedia.models.default',
                             'org.thingpedia.models.developer.contextual', 'org.thingpedia.models.contextual'];
            }
        } else {
            if (data.context) {
                fallbacks = ['org.thingpedia.models.contextual', 'org.thingpedia.models.developer.contextual',
                             'org.thingpedia.models.default', 'org.thingpedia.models.developer'];
            } else {
                fallbacks = ['org.thingpedia.models.default', 'org.thingpedia.models.developer',
                             'org.thingpedia.models.contextual', 'org.thingpedia.models.developer.contextual'];
            }
        }

        for (const candidate of fallbacks) {
            model = service.getModel(candidate, params.locale);
            if (model && model.trained) {
                if (model.contextual && !data.context) {
                    data.context = 'null';
                    data.entities = {};
                } else if (!model.contextual) {
                    data.context = undefined;
                    data.entities = undefined;
                }
                break;
            }
        }
        if (!model) {
            res.status(500).json({ error: 'No default model' });
            return undefined;
        }
    }

    if (model.accessToken !== null && model.accessToken !== data.access_token) {
        res.status(404).json({ error: 'No such model' });
        return undefined;
    }

    const { tokens, candidates, entities, intent } = await model.predictor.sendUtterance(query,
        data.context ? data.context.split(' ') : undefined, data.context ? data.entities : undefined, data);

    if (store !== 'no' && expect !== 'MultipleChoice' && tokens.length > 0) {
        await db.withClient((dbClient) => {
            return exampleModel.logUtterance(dbClient, {
                language: model.locale,
                preprocessed: tokens.join(' '),
                context: (!data.context || data.context === 'null') ? null : data.context,
                target_code: candidates.length > 0 ? (candidates[0]['code'].join(' ')) : ''
            });
        });
    }

    res.set("Cache-Control", "no-store,must-revalidate");
    return {
        result: 'ok',
        candidates, tokens, entities, intent
    };
}

module.exports = runNLU;
