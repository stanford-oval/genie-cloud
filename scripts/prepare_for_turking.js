#!/usr/bin/env node
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
const NNOutputParser = require('thingtalk/lib/nn_output_parser');
//const SchemaRetriever = ThingTalk.SchemaRetriever;

//const AdminThingpediaClient = require('./deps/admin-thingpedia-client');
//const db = require('../util/db');
// const i18n = require('../util/i18n');

const rng = seedrandom('almond is awesome');
function coin(prob) {
    return rng() <= prob;
}
function uniform(array) {
    return array[Math.floor(rng() * array.length)];
}

function uniformSubset(n, subsetOf) {
    if (n === 0)
        return [];
    if (n >= subsetOf.length)
        return subsetOf;

    let taken = [];
    function next() {
        let idx = Math.floor(rng()*(subsetOf.length - taken.length));
        for (let i = 0; i < subsetOf.length; i++) {
            if (taken[i])
                continue;
            if (idx === 0) {
                taken[i] = true;
                return subsetOf[i];
            }
            idx--;
        }
    }

    let res = [];
    while (n > 0) {
        res.push(next());
        n--;
    }
    return res;
}

const VALUES = {
    QUOTED_STRING: ["i'm happy", "you would never believe what happened", "merry christmas", "love you"],

    NUMBER: [42, 7, 14, 11, 55],

    MEASURE: {
        'F': [73, 75, 80],
        'C': [20, 21, 17],
        
        'KB': [300],
        'MB': [15, 40],
        'GB': [2, 3],
        'TB': [1.5, 2],
        
        'kg': [75, 81, 88],
        'lb': [150, 180, 239],
        
        'm': [800, 1500],
        'km': [23, 50],
        'mi': [30, 200],
        
        'kmph': [70, 120],
        'mph': [35, 60]
    },
    CURRENCY: [
        ['$100', { value: 100, unit: 'usd' }],
        ['15 dollars', { value: 15, unit: 'usd' }],
        ['$ 3.50', { value: 3.5, unit: 'usd' }]
    ],
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
    PATH_NAME: [
        'images/lol.png',
        'images/me.png',
        'documents/work.pdf',
        'videos/cat.mp4',
        'school/cs101/hw1.pdf'
    ],

    'GENERIC_ENTITY_tt:stock_id':
        [["Google", 'goog'], ["Apple", 'aapl'], ['Microsoft', 'msft'], ['Walmart', 'wmt']],
    'GENERIC_ENTITY_tt:iso_lang_code':
        [["Italian", 'it'], ["German", 'de'], ["Chinese", 'zh'], ['Spanish', 'es']],
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
    'GENERIC_ENTITY_tt:country': [
        ['United States', 'us'],
        ['Italy', 'it'],
        ['UK', 'gb'],
        ['Germany', 'de']
    ],
    'GENERIC_ENTITY_gov.nasa:curiosity_rover_camera': [
        ['Mast Camera', 'MAST'],
        ['Front Hazard Avoidance Camera', 'FHAZ'],
        ['Mars Hand Lens Imager', 'MAHLI']
    ],
    'GENERIC_ENTITY_imgflip:meme_id': [
        ['Futurama Fry', '61520'],
        ['Brace Yourselves', '61546']
    ],
    'GENERIC_ENTITY_com.instagram:filter': [
        ['Inkwell', 'inkwell'],
        ['Lo-Fi', 'lo-fi'],
        ['Sierra', 'sierra']
    ],
};

// params with special value
const PARAMS_SPECIAL_STRING = {
    'repo_name': ['android_repository', 'twbs/bootstrap'],
    'folder_name': ['archive', 'school'],
    'purpose': ['research project'],
    'query': ['super bowl'],
    'summary': ['celebration'],
    'category': ['sports'],
    'from_name': ['bob'],
    'sender_name': ['bob', 'alice', 'charlie'],
    'blog_name': ['government secret'],
    'description': ['christmas'],
    'organizer': ['stanford'],
    'user': ['bob'],
    'positions': ['ceo'],
    'specialties': ['java'],
    'industry': ['music'],
    'template': ['wtf'],
    'text_top': ['ummm... i have a question...'],
    'text_bottom': ['wtf?'],

    // for icalendar
    'location': ["conference room 7", "downtown", "bob's house"],

    // for spotify
    'song': ['hey jude', 'california girls'],
    'album': ['yellow submarine', 'thriller'],
    'playlist': ['my favorite', 'classics'],
    'artist': ['beetles', 'taylor swift'],
    'toPlay': ['hey jude', 'california girls'],
    'toAdd': ['hey jude', 'california girls'],
    'key': ['a major'],

};

const SPECIAL_TOKENS = {
    '.': '.',
    ',': ',',
    'n\'t': 'n\'t',
    '\'s': '\'s',
    '?': '?',

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

const BLACK_LIST_FUNCTION = new Set([
    '@org.thingpedia.builtin.thingengine.builtin.get_commands',
    '@com.xkcd.what_if',
    '@heatpad.set_power',
    '@com.github.add_email',
    '@com.bodytrace.scale.get',
    'enum:unclosed'
]);

class UnassignableEntity extends Error {}

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
            if (param === 'toPlay' && functionname === '@com.spotify.play_album')
                choices = PARAMS_SPECIAL_STRING['album'].map(quote);
            else if (param === 'toPlay' && functionname === '@com.spotify.play_artist')
                choices = PARAMS_SPECIAL_STRING['artist'].map(quote);
            else if (param === 'toPlay' && functionname === '@com.spotify.play_my_playlist')
                choices = PARAMS_SPECIAL_STRING['playlist'].map(quote);
            else if (param === 'toPlay' && functionname === '@com.spotify.play_playlist')
                choices = PARAMS_SPECIAL_STRING['playlist'].map(quote);
            else if (param === 'toAdd' && functionname === '@com.spotify.add_ablum_to_playlist')
                choices = PARAMS_SPECIAL_STRING['album'].map(quote);
            else
                choices = PARAMS_SPECIAL_STRING[param].map(quote);
        } else if (entitytype === 'PATH_NAME' && (param === 'repo_name' || param === 'folder_name')) {
            choices = [];
        } else if (entitytype === 'GENERIC_ENTITY_tt:iso_lang_code' && param === 'source_language') {
            choices = [["English", 'en']];
        } else if (entitytype === 'NUMBER' && !!unit) {
            choices = VALUES.MEASURE[unit];
            if (!choices)
                throw new Error('Invalid unit ' + unit);
        } else if (entitytype === 'QUOTED_STRING') {
            choices = VALUES.QUOTED_STRING.map(quote);
        } else if (entitytype === 'NUMBER' && param === 'temperature') {
            throw new Error('??? ' + param + ' ' + unit);
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

        let index = parseInt(entity.substring(underscoreindex+1));
        if (choices.length > 0) {
            for (let i = 0; i < 4; i++) {
                let [display, value] = uniform(choices);

                if (entitytype === 'NUMBER' && assignedEntities['NUMBER_' + (index-1)] && assignedEntities['NUMBER_' + (index-1)].value >= value)
                    continue;
                if (entitytype === 'NUMBER' && assignedEntities['NUMBER_' + (index+1)] && assignedEntities['NUMBER_' + (index+1)].value <= value)
                    continue;
                if (!usedValues.has(value)) {
                    assignedEntities[entity] = { display, value };
                    usedValues.add(value);
                    if (entitytype.startsWith('GENERIC_ENTITY_'))
                        return { display, value };
                    else
                        return value;
                }
            }
        }

        throw new UnassignableEntity(`Run out of values for ${entity} (unit ${unit}, param name ${param})`);
    }

    if (code.indexOf('@com.twitter.post on param:status = param:text') >= 0)
        return null;

    code = code.split(' ');
    
    for (let token of code) {
        if (BLACK_LIST_FUNCTION.has(token))
            return null;
    }

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
    
    let hasTweetInbox = false;
    for (let i = 0; i < code.length; i++) {
         let token = code[i];
         if (token === '@com.twitter.search' || token === '@com.twitter.home_timeline' || token === '@com.twitter.my_tweets') {
             hasTweetInbox = true;
             continue;
         }
         if (hasTweetInbox &&
             (token === '@com.twitter.post' || token === '@com.twitter.post_picture'))
             return null;
    }

    let program;
    try {
        program = ThingTalk.NNSyntax.fromNN(code, entityRetriever);
    } catch(e) {
        if (!(e instanceof UnassignableEntity))
            throw e;
        console.log('Skipped ' + id + ': ' + e.message);
        return null;
    }

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
    
    let queries = [];
    let actions = [];
    for (let [what, invocation] of program.iteratePrimitives()) {
        if (invocation.selector.isBuiltin)
            continue;
        if (invocation.selector.kind === 'org.thingpedia.builtin.thingengine.builtin' &&
            invocation.channel === 'say')
            continue;
        if (what === 'table')
            queries.push('@' + invocation.selector.kind + '.' + invocation.channel);
        else
            actions.push('@' + invocation.selector.kind + '.' + invocation.channel);
    }
    let function_signature = queries.concat(actions).join('+');

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
            && ['==', '>=', '<=', '=~', '!=', 'contains', 'in_array', 'starts_with', 'ends_with'].indexOf(code[i+1]) >= 0
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
        code: program.prettyprint(true),
        depth: depth,
        sentence_complexity,
        program_complexity,
        num_functions,
        num_entities,
        num_pp,
        num_filters,
        score,
        function_signature,
        queries,
        actions
    };
}

//const everything = [];

const HIGH_VALUE_DEVICES = new Set([
    '@com.gmail',
    '@com.yandex',
    '@org.thingpedia.weather',
    '@org.thingpedia.icalendar',
    '@org.thingpedia.builtin.thingengine.phone',
    '@com.uber',
    '@security-camera',
    '@com.lg.tv',
    '@com.bing',
    '@com.twitter',
    '@com.wsj',
    '@com.spotify'
])

const HIGH_VALUE_FUNCTIONS = new Set([
    '@us.sportradar.nba',
    '@com.twitter.home_timeline',
    '@com.gmail.inbox',
    '@com.dropbox.list_folder',
    '@edu.stanford.rakeshr1.fitbit.getsteps',
    '@com.thecatapi.get',
    '@com.instagram.get_pictures',
    '@com.washingtonpost.get_article',
    '@org.thingpedia.weather.current',
    '@com.yahoo.finance.get_stock_quote',
    '@com.yandex.translate.translate',
    '@security-camera.current_event',
    '@org.thingpedia.icalendar.list_events',
    '@com.bing.web_search',
    '@org.thingpedia.builtin.thingengine.phone.get_gps',
    
    '@org.thingpedia.bluetooth.speaker.a2dp.play_music',
    '@org.thingpedia.builtin.thingengine.phone.set_ringer',
    '@org.thingpedia.builtin.thingengine.phone.call',
    '@com.facebook.post',
    '@com.twitter.post_picture',
    '@com.gmail.send_email',
    '@com.gmail.reply',
    '@thermostat.set_target_temperature',
    '@light-bulb.set_power',
    '@com.lg.tv.webos2.play_url',
    '@com.live.onedrive.upload_picture'
]);

function has_device(code) {
    for (let device of HIGH_VALUE_DEVICES)
        if (code.indexOf(device) > -1)
            return true;
    return false;
}

function remove_units(code) {
    return code.replace(/unit:\S+/g, '');
}

function prepare_sample_by_sig(input, output) {
    const bags = new Map;
     input.on('data', (line) => {
        let [id, sentence, code] = line.split('\t');
        sentence = sentence.split(' ');

        try {
            let result= processOne(id, sentence, code);
            if (!result)
                return;
            let functionsig = result.function_signature;
            if (!bags.has(functionsig))
                bags.set(functionsig, []);
            bags.get(functionsig).push(result);
        } catch(e) {
            console.error(`Failed example ${id}\t${sentence}\t${code}`);
            throw e;
        }
    });

    input.on('end', () => {
        for (let [sig, choices] of bags) {
            if (choices.length === 0)
                continue;
            let signature = sig.split('+');
            
            let chosen = [];
            if (signature.length === 1) {
                if (choices[0].queries.length === 1) {
                    console.log('primitive query: ' + signature[0] + ' ' + choices.length);
                    chosen = uniformSubset(50, choices);
                } else {
                    console.log('primitive action: ' + signature[0] + ' ' + choices.length);
                    chosen = uniformSubset(20, choices);
                }
            } else if (signature.length === 2) {
                if (signature[0] === signature[1])
                    continue;
                if (signature.every((sig) => HIGH_VALUE_FUNCTIONS.has(sig))) {
                    console.log('high value compound: ' + signature.join('+') + ' ' + choices.length);
            
                    chosen = uniformSubset(10, choices);
                } else if (signature.some((sig) => HIGH_VALUE_FUNCTIONS.has(sig))) {
                    console.log('mid value compound: ' + signature.join('+') + ' ' + choices.length);
                    chosen = uniformSubset(1, choices);
                } else {
                    console.log('low value compound: ' + signature.join('+') + ' ' + choices.length);
                    if (coin(0.05))
                        chosen = [uniform(choices)];
                }
            } else if (signature.length === 3) {
                if (coin(0.1))
                    chosen = [uniform(choices)];
            }

            console.log('produced for ' + signature.join('+') + ' : ' + chosen.length);
            for (let c of chosen)
                output.write(c);
        }
    
        output.end();
    });
}

function prepare_sample_by_code(input, output, compound_only) {
    const bags = new Map;
    input.on('data', (line) => {
        let [id, sentence, code] = line.split('\t');
        sentence = sentence.replace('hey almond ', '').replace('hey sabrian', '').replace('sabrina ', '').replace('almond ', '').split(' ');

        try {
            let result= processOne(id, sentence, code);
            if (!result)
                return;
            if (compound_only && result.function_signature.split('+').length <= 1)
                return;
            let unified = remove_units(code);
            if (!bags.has(unified))
                bags.set(unified, []);
            bags.get(unified).push(result);
        } catch(e) {
            console.error(`Failed example ${id}\t${sentence}\t${code}`);
            throw e;
        }
    });

    input.on('end', () => {
        for (let [code, choices] of bags) {
            if (choices.length === 0)
                continue;
            if (has_device(code)) 
                output.write(uniformSubset(1, choices)[0]);
        }
    
        output.end();
    });
}

function main() {
    const input = byline(process.stdin);
    input.setEncoding('utf8');
    const output = csv.stringify({ header: true, delimiter: '\t' });
    const file = fs.createWriteStream(process.argv[2]);
    output.pipe(file);
    
    const by_signature = false;
    const compound_only = false;

    if (by_signature)
        prepare_sample_by_sig(input, output);
    else
        prepare_sample_by_code(input, output, compound_only);
   
}
main();
