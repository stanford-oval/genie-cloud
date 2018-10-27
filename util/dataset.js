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
const { splitParams } = require('./tokenize');

const db = require('./db');
const exampleModel = require('../model/example');
const deviceModel = require('../model/device');

const kindMap = {
    'thermostat': 'com.nest.thermostat',
    'light-bulb': 'com.hue',
    'security-camera': 'com.nest.security_camera',
    'car': 'com.tesla.car',
};

function getCheatsheet(language) {
    return db.withClient(async (dbClient) => {
        const [devices, examples] = await Promise.all([
            deviceModel.getAllApproved(dbClient, null),
            exampleModel.getCheatsheet(dbClient, language)
        ]);

        const deviceMap = new Map;
        devices.forEach((d, i) => {
            d.examples = [];
            deviceMap.set(d.primary_kind, i);
        });

        var dupes = new Set;
        examples.forEach((ex) => {
            if (dupes.has(ex.target_code) || !ex.target_code)
                return;
            dupes.add(ex.target_code);
            let kind = ex.kind;
            if (kind in kindMap)
                kind = kindMap[kind];

            if (!deviceMap.has(kind)) {
                // ignore what we don't recognize
                console.log('Unrecognized kind ' + kind);
            } else {
                devices[deviceMap.get(kind)].examples.push(ex);
            }
        });

        for (let device of devices)
            device.examples = sortAndChunkExamples(device.examples);

        return devices;
    });
}

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

function sortAndChunkExamples(rows) {
    let trigger_ex = [], query_ex = [], action_ex = [], other_ex = [];
    for (let ex of rows) {
        ex.target_code = ex.target_code.replace(/^\s*let\s+table/, 'query')
            .replace(/^\s*let\s+(stream|query|action)/, '$1');

        if (ex.utterance.startsWith(','))
            ex.utterance = ex.utterance.substring(1);
        ex.utterance_chunks = splitParams(ex.utterance.trim());

        const match = /^\s*(stream|query|action|program)/.exec(ex.target_code);
        if (match === null) {
            ex.type = 'program';
            other_ex.push(ex);
            continue;
        }
        ex.type = match[1];
        switch (match[1]) {
        case 'stream':
            trigger_ex.push(ex);
            break;
        case 'query':
            query_ex.push(ex);
            break;
        case 'action':
            action_ex.push(ex);
            break;
        default:
            other_ex.push(ex);
            break;
        }
    }

    return [].concat(trigger_ex, query_ex, action_ex, other_ex);
}

module.exports = {
    examplesToDataset(name, language, rows, options = {}) {
        return `dataset @${name} language "${language}" {
${rowsToExamples(rows, options)}}`;
    },

    sortAndChunkExamples,

    getCheatsheet
};
