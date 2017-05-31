// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
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
        this.thingpedia = new ThingpediaClient();
        this._schemaRetriever = new SchemaRetriever(this.thingpedia);

        this._raw = null;
    }

    toThingTalk(json) {
        return SEMPRESyntax.parseToplevel(this._schemaRetriever, json).then((ast) => {
            return ThingTalk.Ast.prettyprint(ast, true);
        });
    }

    learnJSON(json) {
        var raw = this._raw;
        return this.sempre.onlineLearn(raw, json);
    }

    learnThingTalk(text) {
        var sempre = SempreSyntax.toSEMPRE(text, false);
        var raw = this._raw;
        return SempreSyntax.verify(this._schemaRetriever, sempre).then(() => {
            var json = JSON.stringify(sempre);
            return this.sempre.onlineLearn(raw, json);
        });
    }

    handle(text) {
        return this.sempre.sendUtterance(text, null, []).then((parsed) => {
            this._raw = text;
            return parsed;
        });
    }
}
