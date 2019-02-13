#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const ThingTalk = require('thingtalk');
const SchemaRetriever = ThingTalk.SchemaRetriever;

const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const db = require('../util/db');
// const i18n = require('../util/i18n');

const _language = process.argv[2] || 'en';
const _schemaRetriever = new SchemaRetriever(new AdminThingpediaClient(_language));

const _counts = new Map;

function loadTemplateAsDeclaration(ex, decl) {
    if (decl.type === 'program')
        return;

    decl.name = 'ex_' + ex.id;
    //console.log(Ast.prettyprint(program));

    // ignore builtin actions:
    // debug_log is not interesting, say is special and we handle differently, configure/discover are not
    // composable
    if (decl.type === 'action' && decl.value.invocation.selector.kind === 'org.thingpedia.builtin.thingengine.builtin')
        return;

    let functionNames = [];

    for (let [, prim] of decl.value.iteratePrimitives()) {
        if (prim.selector.isBuiltin)
            continue;
        functionNames.push(prim.selector.kind + ':' + prim.channel);
    }
    const functionName = functionNames.join('+');

    let count = _counts.get(functionName);
    if (count === undefined)
        count = 1;
    else
        count++;
    _counts.set(functionName, count);
}

function targetCodeToTT(code) {
    if (/^\s*(stream|query|action|program)\s*/.test(code))
        return `dataset @ignored language "en" { ${code} }`;
    else
        return code;
}

function loadTemplate(ex) {
    return Promise.resolve().then(() => ThingTalk.Grammar.parseAndTypecheck(targetCodeToTT(ex.target_code), _schemaRetriever, true)).then((program) => {
        if (program.isMeta)
            loadTemplateAsDeclaration(program.datasets[0].examples[0], program.datasets[0].examples[0]);
        else if (program.rules.length === 1 && program.declarations.length === 0)
            ; // ignore examples that consist of a rule (they are just dataset)
        else if (program.declarations.length === 1 && program.rules.length === 0)
            loadTemplateAsDeclaration(ex, program.declarations[0]);
        else
            console.log('Invalid template ' + ex.id + ' (wrong number of declarations)');
    }).catch((e) => {
        console.error('Failed to load template ' + ex.id + ': ' + ex.target_code, e);
    });
}

function loadMetadata(language) {
    return db.withClient((dbClient) =>
        db.selectAll(dbClient, `select * from example_utterances where type = 'thingpedia' and language = ? and is_base = 1 and target_code <> ''`, [language])
    ).then((examples) => {
        console.log('Loaded ' + examples.length + ' templates');
        return Promise.all(examples.map((ex) => loadTemplate(ex)));
    }).then(() => {
        let list = [];
        let total = 0;
        for (let [functionName, count] of _counts) {
            list.push([functionName, count]);
            total += count;
        }
        list.sort(([aname, acount], [bname, bcount]) => bcount - acount);
        for (let [vname, vcount] of list)
            console.log(`${vname}: ${vcount}`);
        console.log('total = ' + total + '/' + list.length);
    });
}

function main() {
    loadMetadata(_language).then(() => process.exit()).done();
}
main();
