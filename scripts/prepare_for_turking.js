// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const fs = require('fs');
const csv = require('csv');
//const assert = require('assert');
const seedrandom = require('seedrandom');
const byline = require('byline');

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;
const NNOutputParser = require('thingtalk/lib/nn_output_parser');
//const SchemaRetriever = ThingTalk.SchemaRetriever;

//const AdminThingpediaClient = require('./deps/admin-thingpedia-client');
//const db = require('../util/db');
// const i18n = require('../util/i18n');

const rng = seedrandom('almond is awesome');
/*function coin(prob) {
    return rng() <= prob;
}*/
function uniform(array) {
    return array[Math.floor(rng() * array.length)];
}

const VALUES = {
    QUOTED_STRING: ["i'm happy", "you would never believe what happened", "merry christmas", "love you"],

    NUMBER: [42, 7, 14, 11, 55],

    MEASURE: {
        C: [{ value: 73, unit: 'F' }, { value: 75, unit: 'F' }, { value: 80, unit: 'F' }],
        m: [{ value: 1000, unit: 'm' }, { value: 42, unit: 'cm' }, { value: 5, unit: 'm' }],
        kg: [{ value: 82, unit: 'kg' }, { value: 155, unit: 'lb' }, { value: 75, unit: 'kg' }],
        kcal: [{ value: 500, unit: 'kcal' }],
        mps: [{ value: 5, unit: 'kmph' }, { value: 25, unit: 'mph' }],
        ms: [{ value: 2, unit: 'h'}, { value: 30, unit: 'min' }, { value: 3, unit: 'day' }],
        byte: [{ value: 5, unit: 'KB' }, { value: 20, unit: 'MB' }, { value: 2, unit: 'GB' }]
    },
    DURATION: [
        ['two hours', { value: 2, unit: 'h'}],
        ['30 minutes', { value: 30, unit: 'min' }],
        ['3 days', { value: 3, unit: 'day' }]
    ],

    LOCATION: [
        ['Palo Alto, California', { latitude: 37.442156, longitude: -122.1634471 }],
        ['Los Angeles, California', { latitude: 34.0543942, longitude: -118.2439408 }]
    ],

    DATE: [
        ['Feb 14 2017', new Date('2017-02-14T00:00:00-08:00')],
        ['May 4th, 2016', new Date('2016-05-04T00:00:00-07:00')],
        ['August 2nd 2017', new Date('2017-08-02T00:00:00-07:00')],
    ],

    TIME: [
        ['7:30 am', { hour: 7, minute: 30, second: 0 }],
        ['3 pm', { hour: 15, minute: 0, second: 0 }],
        ['8:30 pm', { hour: 20, minute: 30, second: 0 }]
    ],

    EMAIL_ADDRESS: ['bob@gmail.com', 'alice@gmail.com', 'charlie@hotmail.com'],
    PHONE_NUMBER: ['+16501234567', '+15551234567', '+123456789'],
    HASHTAG: [
        ['#funny', 'funny'], ['#cat', 'cat'], ['#lol', 'lol'],
        ['#covfefe', 'covfefe']
    ],
    USERNAME: [['@alice', 'alice'], ['@bob', 'bob'], ['@charlie', 'charlie']],
    URL: [
        'http://www.abc.def',
        ['www.google.com', 'http://www.google.com'],
        'http://www.example.com'
    ],

    'GENERIC_ENTITY_tt:stock_id':
        [["Google", 'goog'], ["Apple", 'aapl'], ['Microsoft', 'msft'], ['Walmart', 'wmt']],
    'GENERIC_ENTITY_tt:iso_lang_code':
        [["Italian", 'it'], ["English", 'en'], ["Chinese", 'zh'], ['Spanish', 'es']],
    'GENERIC_ENTITY_sportradar:eu_soccer_team':
        [["Juventus", "juv"], ["Barcelona", "bar"], ["Bayern Munich", "fcb"], ["Chelsea", 'che']],
    'GENERIC_ENTITY_sportradar:mlb_team':
        [["SF Giants", 'sf'], ["Chicago Cubs", 'chc']],
    'GENERIC_ENTITY_sportradar:nba_team':
        [["Golden State Warriors", 'gsw'], ["LA Lakers", 'lal']],
    'GENERIC_ENTITY_sportradar:ncaafb_team':
        [["Stanford Cardinals", 'sta'], ["California Bears", 'cal']],
    'GENERIC_ENTITY_sportradar:ncaambb_team':
        [["Stanford Cardinals", 'stan'], ["California Bears", 'cal']],
    'GENERIC_ENTITY_sportradar:nfl_team':
        [["Seattle Seahawks", 'sea'], ["SF 49ers", 'sf']],
    'GENERIC_ENTITY_sportradar:us_soccer_team':
        [["San Jose Earthquakes", 'sje'], ["Toronto FC", 'tor']],
    'GENERIC_ENTITY_tt:mime_type': [
        ['PDF documents', 'application/pdf'],
        ['JPEG pictures', 'image/jpeg'],
        ['Word documents', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['Excel spreadsheets', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    ],
};

// params with special value
const PARAMS_SPECIAL_STRING = {
    'repo_name': ['android_repository'],
    'file_name': ['log.txt'],
    'old_name': ['log.txt'],
    'new_name': ['backup.txt'],
    'folder_name': ['archive'],
    'purpose': ['research project'],
    'filter': ['lo-fi'],
    'query': ['super bowl'],
    'summary': ['celebration'],
    'category': ['sports'],
    'from_name': ['bob'],
    'blog_name': ['government secret'],
    'camera_used': ['mastcam'],
    'description': ['christmas'],
    'source_language': ['english'],
    'target_language': ['chinese'],
    'detected_language': ['english'],
    'organizer': ['stanford'],
    'user': ['bob'],
    'positions': ['ceo'],
    'specialties': ['java'],
    'industry': ['music'],
    'template': ['wtf'],
    'text_top': ['ummm... i have a question...'],
    'text_bottom': ['wtf?'],
    'phase': ['full moon']
};

const SPECIAL_TOKENS = {
    '.': '.',
    ',': ',',
    'n\'t': 'n\'t',
    '\'s': '\'s',

    // right/left round/curly/square bracket
    '-rrb-': ')',
    '-lrb-': ' (',
    '-rcb-': '}',
    '-lcb-': ' {',
    '-rsb-': ']',
    '-lsb-': ' [',
};

function quote(qs) {
    return [`"${qs}"`, qs];
}

class SimpleSequenceLexer {
    constructor(sequence) {
        this._sequence = sequence;
        this._i = 0;
    }

    next() {
        if (this._i >= this._sequence.length)
            return { done: true };

        let next = this._sequence[this._i++];
        if (/^[A-Z]/.test(next)) {
            // entity
            next = next.substring(0, next.lastIndexOf('_'));
            if (next.startsWith('GENERIC_ENTITY_'))
                next = 'GENERIC_ENTITY';
        } else if (next.startsWith('@')) {
            next = 'FUNCTION';
        } else if (next.startsWith('enum:')) {
            next = 'ENUM';
        } else if (next.startsWith('param:')) {
            next = 'PARAM_NAME';
        } else if (next.startsWith('unit:')) {
            next = 'UNIT';
        }
        return { done: false, value: next };
    }
}

function processOne(id, tokenizedsentence, code) {
    const assignedEntities = {};
    const usedValues = new Set;

    function entityRetriever(entity, param, functionname, unit) {
        if (assignedEntities[entity])
            return assignedEntities[entity].value;

        const underscoreindex = entity.lastIndexOf('_');
        const entitytype = entity.substring(0, underscoreindex);

        let choices;
        if (entitytype === 'QUOTED_STRING' && !!param &&
            PARAMS_SPECIAL_STRING[param]) {
            choices = PARAMS_SPECIAL_STRING[param].map(quote);
        } else if (entitytype === 'NUMBER' && !!unit) {
            choices = VALUES.MEASURE[Type.Measure(unit).unit].map((value) =>
                [value + ' ' + value.unit, value]);
        } else if (entitytype === 'QUOTED_STRING') {
            choices = VALUES.QUOTED_STRING.map(quote);
        } else {
            choices = VALUES[entitytype];
            if (!choices)
                throw new Error('unrecognized entity type ' + entitytype);
        }
        choices = choices.map((c) => {
            if (typeof c === 'string' || typeof c === 'number')
                return [String(c), c];
            else
                return c;
        });

        for (let i = 0; i < 4; i++) {
            let [display, value] = uniform(choices);
            if (!usedValues.has(value)) {
                assignedEntities[entity] = { display, value };
                if (entitytype.startsWith('GENERIC_ENTITY_'))
                    return { display, value };
                else
                    return value;
            }
        }

        throw new Error(`Run out of values for ${entity} (unit ${unit}, param name ${param})`);

    }

    if (code.indexOf('@com.twitter.post on param:status = param:text') >= 0)
        return null;

    code = code.split(' ');

    let hasGmailInbox = false;
    for (let i = 0; i < code.length; i++) {
         let token = code[i];
         if (token === '@com.gmail.inbox') {
             hasGmailInbox = true;
             continue;
         }
         if (hasGmailInbox &&
             (token === '@com.gmail.send_email' || token === '@com.gmail.send_picture'))
             return null;
    }

    const program = ThingTalk.NNSyntax.fromNN(code, entityRetriever);

    let sentence = '';
    let prevtoken = null;
    let num_entities = 0;
    for (let token of tokenizedsentence) {
        // replace entities and undo penn tree bank tokenization
        if (/^[A-Z]/.test(token)) { // entity
            num_entities ++;
            if (!assignedEntities[token])
                throw new Error(`Missing entity ${token} (present in the sentence, not in the code)`);
            if (prevtoken)
                sentence += ' ';
            sentence += assignedEntities[token].display;
        } else if (token in SPECIAL_TOKENS) {
            sentence += SPECIAL_TOKENS[token];
        } else if (token === 'not' && prevtoken === 'can') {
            sentence += 'not';
        } else {
            if (prevtoken)
                sentence += ' ';
            sentence += token;
        }
        prevtoken = token;
    }

    let parser = new NNOutputParser();
    let reduces = parser.getReduceSequence({
        [Symbol.iterator]() {
            return new SimpleSequenceLexer(code);
        }
    });

    let num_functions = 0;
    let num_pp = 0;
    let num_filters = 0;
    for (let i = 0; i < code.length; i++) {
        let token = code[i];
        if (token.startsWith('@') && token !== '@org.thingpedia.builtin.thingengine.builtin.say')
            num_functions++;
        if (token.startsWith('param:')
            && i < code.length -2 &&
            code[i+1] === '=' &&
            code[i+2].startsWith('param:'))
            num_pp++;
        if (token.startsWith('param:')
            && i < code.length -1
            && code[i+1] !== '='
            && !code[i-2].startsWith('param:'))
            num_filters++;
    }

    const depth = parseInt(id[0]);
    const program_complexity = reduces.length;
    const sentence_complexity = tokenizedsentence.length;
    const score =
        1 * depth +
        2 * num_functions +
        0.05 * program_complexity +
        0.1 * sentence_complexity +
        0.1 * num_entities +
        0.4 * num_pp +
        0.5 * num_filters;

    return {
        id,
        sentence,
        code: ThingTalk.Ast.prettyprint(program, true),
        depth: depth,
        sentence_complexity,
        program_complexity,
        num_functions,
        num_entities,
        num_pp,
        num_filters,
        score
    };
}

//const everything = [];

function main() {
    const input = byline(process.stdin);
    input.setEncoding('utf8');
    const output = csv.stringify({ header: true, delimiter: '\t' });
    const file = fs.createWriteStream(process.argv[2]);
    output.pipe(file);

    input.on('data', (line) => {
        let [id, sentence, code] = line.split('\t');
        sentence = sentence.split(' ');

        try {
            let result= processOne(id, sentence, code);
            if (!result)
                return;
            output.write(result);
        } catch(e) {
            console.error(`Failed example ${id}\t${sentence}\t${code}`);
            throw e;
        }
    });

    input.on('end', () => output.end());
}
main();
