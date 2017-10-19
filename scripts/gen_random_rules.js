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
const i18n = require('../util/i18n');
const SchemaRetriever = require('./deps/schema_retriever');

const dlg = { _(x) { return x; } };

function postprocess(str) {
    str = str.replace(/your/g, 'my').replace(/ you /g, ' I ');

    return str;
}

function postprocessSetup(str, name) {
    let female;
    if (name === 'ellie' || name === 'gabbie')
        female = true;
    else
        female = false;

    str = str.replace(/your/g, female ? 'her' : 'his').replace(/ you /g, female ? ' she ' : ' he ');

    return str;
}

function coin(bias) {
    return Math.random() < bias;
}
function uniform(array) {
    return array[Math.floor(array.length * Math.random())];
}

function makeId() {
    return crypto.randomBytes(8).toString('hex');
}

function describeRule(gettext, r) {
    let scope = {};
    let triggerDesc = r.trigger ? `WHEN: ${Describe.describePrimitive(gettext, r.trigger, 'trigger', scope, true)}` :'';

    let queryDesc = r.queries.map((q) => `GET: ${Describe.describePrimitive(gettext, q, 'query', scope, true)}`).join(' ');
    let actions = r.actions.filter((a) => !a.selector.isBuiltin);
    let actionDesc = actions.map((a) => `DO: ${Describe.describePrimitive(gettext, a, 'action', scope, true)}`).join(' ');

    return (triggerDesc + ' ' + queryDesc + ' ' + actionDesc).trim();
}

function describeProgram(gettext, prog) {
    return prog.rules.map((r) => describeRule(gettext, r)).join('; ');
}

function main() {
    const output = csv.stringify();
    const file = fs.createWriteStream(process.argv[2] || 'output.csv');
    output.pipe(file);
    const samplingPolicy = process.argv[3] || 'uniform';
    const language = process.argv[4] || 'en';
    const gettext = i18n.get(language);
    const N = parseInt(process.argv[5]) || 100;
    const format = process.argv[6] || 'default';

    let genPermissions = false;
    if (format === 'permissions' || format === 'permissions-turk')
        genPermissions = true;
    let genSetup = false;
    if (format === 'setup' || format === 'setup-turk')
        genSetup = true;
    let wgd = false;
    if (format === 'wgd' || format === 'wgd-turk')
        wgd = true;
    let turkFormat = false;
    if (format === 'turk' || format.endsWith('-turk'))
        turkFormat = true;
    if (turkFormat) {
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
        return db.selectAll(dbClient, "select kind from device_schema where approved_version is not null and kind_type <> 'global' and kind <> 'org.thingpedia.builtin.test' and kind not like 'org.thingpedia.demo.%'", []).then((rows) => {
            let kinds = rows.map(r => r.kind);
            let schemaRetriever = new SchemaRetriever(dbClient, language);

            let stream;

            if (!genPermissions) {
                stream = ThingTalk.Generate.genRandomRules(kinds, schemaRetriever, N, {
                    compositionWeights: {
                        'trigger+query+action': 0.5,
                        'trigger+null+action': 1,
                        'trigger+query+null': 0.5,
                        'trigger+null+null': 1,
                        'null+query+action': 3,
                        'null+query+null': 2,
                        'null+null+action': 6,
                        'trigger+null+return': 8,
                        'null+query+return': 8,
                        // null+null+null: 0
                    },
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
            } else {
                stream = ThingTalk.Generate.genRandomPermissionRule(kinds, schemaRetriever, N, {
                    applyHeuristics: true,
                    allowUnsynthesizable: false,
                    samplingPolicy: 'uniform',
                    filterClauseProbability: 0.1
                });
            }
            stream.on('data', (r) => {
                //console.log('Rule #' + (i+1));
                //i++;
                ThingTalk.SEMPRESyntax.toSEMPRE(r);
                if (genSetup)
                    r.principal = new Ast.Value.Entity(uniform(['ellie', 'frank', 'gabbie', 'henry']), 'tt:contact_name', null);

                let code, description;
                if (genPermissions) {
                    code = Ast.prettyprintPermissionRule(r, true).trim();
                    description = ThingTalk.Describe.describePermissionRule(gettext, r);
                } else if (wgd) {
                    code = Ast.prettyprint(r, true).trim();
                    description = describeProgram(gettext, r);
                } else {
                    code = Ast.prettyprint(r, true).trim();
                    description = ThingTalk.Describe.describeProgram(gettext, r, true);
                }

                if (!genSetup)
                    description = postprocess(description);
                else
                    description = postprocessSetup(description, r.principal.value);

                let newTuple = [makeId(), code, description];
                if (turkFormat) {
                    row = row.concat(newTuple);
                    if (row.length === sentences_per_hit * 3) {
                        output.write(row);
                        row = []
                    }
                } else {
                    output.write(newTuple);
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
