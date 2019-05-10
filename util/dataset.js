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
const { InternalError } = require('./errors');

const TpClient = require('genie-toolkit/tool/lib/file_thingpedia_client');

const kindMap = {
    'thermostat': 'com.nest.thermostat',
    'light-bulb': 'com.hue',
    'security-camera': 'com.nest.security_camera',
    'car': 'com.tesla.car',
    'com.tumblr.blog': 'com.tumblr'
};

const useWhiteList = false;

const whiteList = [
    'com.google.drive',
    'com.dropbox',
    'com.live.onedrive'
];

function getCheatsheet(language, thingpedia, dataset, rng = Math.random) {
    return loadThingpedia(language, thingpedia, dataset, rng).then(([devices, examples]) => {
        const deviceMap = new Map;
        devices = devices.filter((d) => { return !(useWhiteList && !whiteList.includes(d.primary_kind)); });
        devices.forEach((d, i) => {
            d.examples = [];
            deviceMap.set(d.primary_kind, i);
        });

        const dupes = new Set;
        examples.forEach((ex) => {
            if (useWhiteList && whiteList.includes(ex.kind))
                return;
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

function loadThingpedia(language, thingpedia, dataset, rng) {
    if (thingpedia && dataset) {
        const tpClient = new TpClient(language, thingpedia, dataset);
        return tpClient.genCheatsheet(true, { rng });
    } else {
        return db.withClient((dbClient) => {
            return Promise.all([
                deviceModel.getAllApproved(dbClient, null),
                exampleModel.getCheatsheet(dbClient, language)
            ]);
        });
    }
}

function rowsToExamples(rows, { editMode = false, skipId = false }) {
    // coalesce by target code

    // note: this code is designed to be fast, and avoid parsing the examples in the common
    // case of up-to-date thingpedia

    let uniqueCode = new Map;
    for (let row of rows) {
        let targetCode = row.target_code || row.program;
        if (!targetCode)
            throw new InternalError('E_DATASET_CORRUPT', `Invalid example ${row.id}, missing program`);

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
                click_count: row.click_count,
                like_count: row.like_count,
            });
        }
    }


    let buffer = [];
    for (let [targetCode, ex] of uniqueCode.entries()) {
        // remove trailing semicolon
        targetCode = targetCode.replace(/[ \r\n\t\v]*;[ \r\n\t\v]*$/, '');

        if (editMode) {
            if (!skipId && ex.id !== undefined) {
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
    #[id=${ex.id}] #[click_count=${ex.click_count}] #[like_count=${ex.like_count}];
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
        else if (ex.type === 'query')
            ex.utterance = 'get ' + ex.utterance;
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
