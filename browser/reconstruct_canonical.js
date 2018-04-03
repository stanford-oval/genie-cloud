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

module.exports = function reconstructCanonical(schemaRetriever, code, entities) {
    return Intent.parse({ code, entities }, schemaRetriever, null, null, []).then((intent) => {
        if (intent.isFailed || intent.isFallback || intent.isTrain ||
            intent.isBack || intent.isEmpty || intent.isFilter || intent.isDebug || intent.isMore)
            throw new Error('Invalid internal intent ' + intent);

        if (intent.isNeverMind)
            return "never mind";
        if (intent.isHelp)
            return "help";
        if (intent.isMake)
            return "make a command";
        if (intent.isAnswer)
            return Describe.describeArg(fakeGettext, intent.value);

        if (intent.isSetup) {
            let progDesc = Describe.describeProgram(fakeGettext, intent.rule);
            return ("ask %s to %s").format(Describe.describeArg(fakeGettext, intent.person), progDesc);
        }

        let program;
        if (intent.isPrimitive)
            program = ThingTalk.Generate.primitiveProgram(intent.primitiveType, intent.primitive);
        else
            program = intent.program;
        return Describe.describeProgram(fakeGettext, program);
    });
};
