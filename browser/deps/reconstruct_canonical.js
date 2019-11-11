// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
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
