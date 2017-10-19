// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const path = require('path');
const fs = require('fs');
const csv = require('csv');
const mysql = require('mysql');

const ThingTalk = require('thingtalk');
const SEMPRESyntax = ThingTalk.SEMPRESyntax;

const db = require('../util/db');
const SchemaRetriever = require('./deps/schema_retriever');

function toSEMPRE(input, output, rule_type) {
    input.on('data', (row) => {
            var tt, json;
            if (rule_type === 'permission') {
                tt = ThingTalk.Grammar.parsePermissionRule(row[1]);
                json = SEMPRESyntax.toSEMPRE(tt, false);
                tt = row[1];
            }
            else {
                tt = ThingTalk.Grammar.parse(row[1]);
                json = SEMPRESyntax.toSEMPRE(tt, false);
                tt = row[1];
            }
            var ex = {
                id: row[0],
                target_json: json,
                target_tt: tt,
                sythetic: row[2],
                utterance: row[3]
            };
            output.write(ex);
        })
        .on('end', () => output.end());
        //.on('error', (err) => { console.error(err) });
}

function toTT(input, output) {
    let promises = [];

    var dbClient = mysql.createConnection(process.env.DATABASE_URL);
    const schemas = new SchemaRetriever(dbClient, 'en-US', true);

    input.on('data', (row) => {
        // note: when going from SEMPRE to TT we don't need to specify whether
        // it's a permission rule or a program, because the json includes that info

        let json = JSON.parse(row[1]);
        promises.push(SEMPRESyntax.parseToplevel(schemas, json).then((prog) => {
            let tt = ThingTalk.Ast.prettyprint(prog, true).trim();

            var ex = {
                id: row[0],
                target_json: json,
                target_tt: tt,
                sythetic: row[2],
                utterance: row[3]
            };
            output.write(ex);
        }));
    });
    input.on('end', () => {
        Promise.all(promises).then(() => {
            output.end();
            dbClient.end();
        });
    });
}

function main() {
    var inp_format = process.argv[2];
    var rule_type = process.argv[3];
    var fin = path.join(process.argv[4], 'data.csv');
    var fout = path.join(process.argv[4], 'data-sempre.csv');

    var output = csv.stringify();
    var parser = csv.parse();
    var file = fs.createWriteStream(fout);
    output.pipe(file);

    var input = fs.createReadStream(fin).pipe(parser);

    if (inp_format === 'tt')
        toSEMPRE(input, output, rule_type);
    else
        toTT(input, output, rule_type);

    file.on('finish', () => process.exit());
}

main();
