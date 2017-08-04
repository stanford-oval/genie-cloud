// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const csv = require('csv');
const crypto = require('crypto');

const ThingTalk = require('thingtalk');
const Describe = ThingTalk.Describe;
const Ast = ThingTalk.Ast;

const db = require('../util/db');
const SchemaRetriever = require('./deps/schema_retriever');

const dlg = { _(x) { return x; } };

function postprocess(str) {
    str = str.replace(/your/g, 'my').replace(/ you /g, ' I ');

    //if (coin(0.1))
    //    str = str.replace(/ instagram /i, ' ig ');
    //if (coin(0.1))
    //    str = str.replace(/ facebook /i, ' fb ');

    return str;
}

function coin(bias) {
    return Math.random() < bias;
}

function makeId() {
    return crypto.randomBytes(8).toString('hex');
}

const gettext = new (require('node-gettext'));
gettext.setlocale('en-US');

function describeRule(r) {
    let scope = {};
    let triggerDesc = r.trigger ? `WHEN: ${Describe.describePrimitive(gettext, r.trigger, 'trigger', scope, true)}` :'';

    let queryDesc = r.queries.map((q) => `GET: ${Describe.describePrimitive(gettext, q, 'query', scope, true)}`).join(' ');
    let actions = r.actions.filter((a) => !a.selector.isBuiltin);
    let actionDesc = actions.map((a) => `DO: ${Describe.describePrimitive(gettext, a, 'action', scope, true)}`).join(' ');

    return (triggerDesc + ' ' + queryDesc + ' ' + actionDesc).trim();
}

function describeProgram(prog) {
    return prog.rules.map((r) => describeRule(r)).join('; ');
}

function main() {
    var output = csv.stringify();
    var file = fs.createWriteStream(process.argv[2] || 'output.csv');
    output.pipe(file);
    var samplingPolicy = process.argv[3] || 'uniform';
    var language = process.argv[4] || 'en';
    var N = parseInt(process.argv[5]) || 100;
    var format = process.argv[6] || 'default';

    if (format === 'turk') {
        var sentences_per_hit = process.argv[7] || 3;
        var headers = [];
        var row = [];
        for (var i = 1; i <= sentences_per_hit; i ++) {
            headers = headers.concat(['id' + i, 'thingtalk' + i, 'sentence' + i]);
        }
        output.write(headers);
    }
    process.on('unhandledRejection', (e) => {
        console.error('Unhandled rejection: ' +e.message);
        console.error(e.stack);
    });

    //var i = 0;
    db.withClient((dbClient) => {
        return db.selectAll(dbClient, "select kind from device_schema where approved_version is not null and kind_type <> 'global'", []).then((rows) => {
            let kinds = rows.map(r => r.kind);
            let schemaRetriever = new SchemaRetriever(dbClient, language);

            let stream = ThingTalk.Generate.genRandomRules(kinds, schemaRetriever, N, {
                applyHeuristics: true,
                allowUnsynthesizable: false,
                strictParameterPassing: true,
                samplingPolicy: 'uniform',
                actionArgConstantProbability: 0.7,
                argConstantProbability: 0.3,
                requiredArgConstantProbability: 0.9,
                applyFiltersToInputs: false,
                filterClauseProbability: 0.3
            });
            stream.on('data', (r) => {
                //console.log('Rule #' + (i+1));
                //i++;
                if (format === 'turk') {
                    row = row.concat([makeId(), Ast.prettyprint(r, true).trim(), postprocess(describeProgram(r))]);
                    if (row.length === sentences_per_hit * 3) {
                        output.write(row);
                        row = []
                    }
                } else {
                    output.write([makeId(), Ast.prettyprint(r, true).trim(), postprocess(describeProgram(r))]);
                }
            });
            stream.on('error', (err) => {
                console.error('Error:' + err.message);
                console.error(err.stack);
                process.exit(1);
            });
            stream.on('end', () => output.end());
        });
    }).done();

    file.on('finish', () => process.exit());
}

main();
