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

const ThingTalk = require('thingtalk');
const { stringEscape } = require('./escaping');

function rowsToExamples(rows, { editMode = false}) {
    // coalesce by target code

    // note: this code is designed to be fast, and avoid parsing the examples in the common
    // case of up-to-date thingpedia

    let uniqueCode = new Map;
    for (let row of rows) {
        let targetCode = row.target_code || row.program;
        if (!targetCode)
            throw new Error(`Invalid example ${row.id}, missing program`);

        if (/^[ \r\n\t\v]*let[ \r\n\t\v]/.test(targetCode)) {
            // forward compatibility: convert the declaration to example syntax
            const parsed = ThingTalk.Grammar.parse(targetCode);
            const declaration = parsed.declarations[0];

            const example = new ThingTalk.Ast.Example(-1,
                declaration.type === 'table' ? 'query' : declaration.type,
                declaration.args,
                declaration.value,
                [], [], {});
            targetCode = example.prettyprint('').trim();
        } else if (!/^[ \r\n\t\v]*(query|action|stream|program)[ \r\n\t\v]/.test(targetCode)) {
            targetCode = `program := ${targetCode}`;
        }

        if (uniqueCode.has(targetCode)) {
            const ex = uniqueCode.get(targetCode);
            ex.utterances.push(row.utterance);
            ex.preprocessed.push(row.preprocessed);
        } else {
            uniqueCode.set(targetCode, {
                id: row.id,
                utterances: [row.utterance],
                preprocessed: [row.preprocessed],
                click_count: row.click_count
            });
        }
    }


    let buffer = [];
    for (let [targetCode, ex] of uniqueCode.entries()) {
        // remove trailing semicolon
        targetCode = targetCode.replace(/[ \r\n\t\v]*;[ \r\n\t\v]*$/, '');

        if (editMode) {
            if (ex.id !== undefined) {
                buffer.push(`    ${targetCode}
    #_[utterances=[${ex.utterances.map(stringEscape)}]]
    #[id=${ex.id}];

`);
            } else {
                buffer.push(`    ${targetCode}
    #_[utterances=[${ex.utterances.map(stringEscape)}]];

`);
            }
        } else {
            buffer.push(`    ${targetCode}
    #_[utterances=[${ex.utterances.map(stringEscape)}]]
    #_[preprocessed=[${ex.preprocessed.map(stringEscape)}]]
    #[id=${ex.id}] #[click_count=${ex.click_count}];
`);
        }
    }

    return buffer.join('');
}

module.exports = {
    examplesToDataset(name, language, rows, options = {}) {
        return `dataset @${name} language "${language}" {
${rowsToExamples(rows, options)}}`;
    }
};
