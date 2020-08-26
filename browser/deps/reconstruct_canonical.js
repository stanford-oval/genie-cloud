// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

const { Intent } = require('./intent');
const ThingTalk = require('thingtalk');
const Describe = ThingTalk.Describe;

const fakeGettext = {
    dgettext(domain, sentence) {
        return sentence;
    },

    dngettext(domain, sentence, plural, num) {
        if (num === 1)
            return sentence;
        else
            return plural;
    }
};

function makeContext() {
    return {
        command: null,
        previousCommand: null,
        previousCandidates: [],
        platformData: {}
    };
}

async function reconstructCanonical(schemaRetriever, code, entities) {
    const intent = await Intent.parse({ code, entities }, schemaRetriever, makeContext());
    if (intent.isExample || intent.isUnsupported || intent.isFailed)
        throw new Error('Invalid internal intent ' + intent);

    const describer = new Describe.Describer(fakeGettext, 'en-US', 'America/Los_Angeles');
    return describer.describe(intent.thingtalk);
}

module.exports = reconstructCanonical;
