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

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

const Q = require('q');

const ThingTalk = require('thingtalk');
const SEMPRESyntax = ThingTalk.SEMPRESyntax;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const SempreClient = require('./sempreclient');
const ThingpediaClient = require('./thingpediaclient');

module.exports = class ThingTalkTrainer {
    constructor(sempreUrl) {
        this.sempre = new SempreClient(sempreUrl, 'en-US');
        this.thingpedia = new ThingpediaClient($('#developer-key').text(), $('#language').text());
        this._schemaRetriever = new SchemaRetriever(this.thingpedia);

        this._raw = null;
    }

    toThingTalk(json) {
        return SEMPRESyntax.parseToplevel(this._schemaRetriever, json).then((ast) => {
            return ThingTalk.Ast.prettyprint(ast, true);
        });
    }

    toSEMPRE(tt) {
        return JSON.stringify(SEMPRESyntax.toSEMPRE(ThingTalk.Grammar.parse(current), false));
    }

    learnJSON(json) {
        var raw = this._raw;
        return this.sempre.onlineLearn(raw, json, 'online');
    }

    learnThingTalk(text) {
        var raw = this._raw;
        return ThingTalk.Grammar.parseAndTypecheck(text, this._schemaRetriever).then((prog) => {
            var sempre = SEMPRESyntax.toSEMPRE(prog, false);
            var json = JSON.stringify(sempre);
            return this.sempre.onlineLearn(raw, json, 'online');
        });
    }

    handle(text) {
        return this.sempre.sendUtterance(text, null, []).then((parsed) => {
            this._raw = text;
            return parsed;
        });
    }
}
