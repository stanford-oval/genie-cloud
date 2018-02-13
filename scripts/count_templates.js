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

const AdminThingpediaClient = require('./deps/admin-thingpedia-client');
const db = require('../util/db');
// const i18n = require('../util/i18n');

const _language = process.argv[3] || 'en';
const _schemaRetriever = new SchemaRetriever(new AdminThingpediaClient(_language));

const _counts = new Map;

function isUnaryTableToTableOp(table) {
    return table.isFilter ||
        table.isProjection ||
        table.isCompute ||
        table.isAlias ||
        table.isAggregation ||
        table.isArgMinMax ||
        table.isSequence ||
        table.isHistory;
}
function isUnaryStreamToTableOp(table) {
    return table.isWindow || table.isTimeSeries;
}
function isUnaryStreamToStreamOp(stream) {
    return stream.isEdgeNew ||
        stream.isEdgeFilter ||
        stream.isFilter ||
        stream.isProjection ||
        stream.isCompute ||
        stream.isAlias;
}
function isUnaryTableToStreamOp(stream) {
    return stream.isMonitor;
}

function findFunctionNameTable(table) {
    if (table.isInvocation)
        return table.invocation.selector.kind + ':' + table.invocation.channel;

    if (isUnaryTableToTableOp(table))
        return findFunctionNameTable(table.table);

    if (isUnaryStreamToTableOp(table))
        return findFunctionNameStream(table.stream);

    throw new TypeError();
}

function findFunctionNameStream(stream) {
    if (stream.isTimer || stream.isAtTimer)
        return 'timer';

    if (isUnaryStreamToStreamOp(stream))
        return findFunctionNameStream(stream.stream);

    if (isUnaryTableToStreamOp(stream))
        return findFunctionNameTable(stream.table);

    throw new TypeError();
}

function loadTemplateAsDeclaration(ex, decl) {
    decl.name = 'ex_' + ex.id;
    //console.log(Ast.prettyprint(program));

    // ignore builtin actions:
    // debug_log is not interesting, say is special and we handle differently, configure/discover are not
    // composable
    if (decl.type === 'action' && decl.value.selector.kind === 'org.thingpedia.builtin.thingengine.builtin')
        return;

    let functionName;
    if (decl.type === 'action')
        functionName = decl.value.selector.kind + ':' + decl.value.channel;
    else if (decl.type === 'table')
        functionName = findFunctionNameTable(decl.value);
    else if (decl.type === 'stream')
        functionName = findFunctionNameStream(decl.value);

    let count = _counts.get(functionName);
    if (count === undefined)
        count = 1;
    else
        count++;
    _counts.set(functionName, count);
}

function loadTemplate(ex) {
    return Promise.resolve().then(() => ThingTalk.Grammar.parseAndTypecheck(ex.target_code, _schemaRetriever, true)).then((program) => {
        if (program.rules.length === 1 && program.declarations.length === 0)
            ; // ignore examples that consist of a rule (they are just dataset)
        else if (program.declarations.length === 1 && program.declarations.length === 1)
            loadTemplateAsDeclaration(ex, program.declarations[0]);
        else
            console.log('Invalid template ' + ex.id + ' (wrong number of declarations)');
    }).catch((e) => {
        console.error('Failed to load template ' + ex.id + ': ' + e.message);
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
        console.log('total = ' + total);
    });
}

function main() {
    loadMetadata(_language).then(() => process.exit()).done();
}
main();
