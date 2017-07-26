// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const csv = require('csv');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const Generate = ThingTalk.Generate;
const Type = ThingTalk.Type;

const SchemaRetriever = require('./deps/schema_retriever');
const db = require('../util/db');

const STRICTLY_CHEATSHEET = false;

function getAllThingpediaSentences(dbClient, language) {
    let target_jsons = new Set;
    return db.selectAll(dbClient, "select * from example_utterances where type = 'thingpedia' and is_base = 1 and language = ? order by id asc", [language]).then((rows) => {
        if (!STRICTLY_CHEATSHEET)
            return rows;

        return rows.filter((row) => {
            if (target_jsons.has(row.target_json))
                return false;
            target_jsons.add(row.target_json);
            return true;
        });
    });
}

function coin(bias) {
    return Math.random() < bias;
}
function uniform(array) {
    return array[Math.floor(Math.random()*array.length)];
}

function sample(distribution) {
    var keys = Object.keys(distribution);
    var sums = new Array(keys.length);
    var rolling = 0;
    for (var i = 0; i < keys.length; i++) {
        sums[i] = rolling + distribution[keys[i]];
        rolling = sums[i];
    }

    var total = sums[keys.length-1];
    var choice = Math.random() * total;

    for (var i = 0; i < keys.length; i++) {
        if (choice <= sums[i])
            return keys[i];
    }
    return keys[keys.length-1];
}

const STRUCTURE_DISTRIBUTION = {
    'trigger+action': 5,
    'trigger+query': 3,
    'query+action': 0.5
};

function handleSelector(prim) {
    let sel = prim.name.id;
    let match = /^(?:tt:)?(\$?[a-z0-9A-Z_.-]+)\.([a-z0-9A-Z_]+)$/.exec(sel);
    if (match === null)
        throw new TypeError('Invalid selector ' + sel);

    return [match[1], match[2]];
}

let TEMPLATES = {
    'trigger+action': [
        "WHEN: %1$s DO: %3$s",
        "WHEN %1$s DO %3$s",
        "when %1$s %3$s",
        "%3$s when %1$s",
        "%3$s if %1$s"
    ],
    'trigger+query': [
        "WHEN: %1$s GET: %2$s",
        "WHEN %1$s GET %2$s",
        "get %2$s when %1$s",
        "get %2$s if %1$s",
        "%2$s when %1$s"
    ],
    'query+action': [
        "GET: %2$s DO: %3$s",
        "GET %2$s DO %3$s",
        "get %2$s then %3$s",
        "%2$s then %3$s",
    ]
};

const STRING_PLACEHOLDER = 'something';
const NUMBER_PLACEHOLDER = 'some number';
const PICTURE_PLACEHOLDER = 'some picture';
const LOCATION_PLACEHOLDER = 'some place';
const DATE_PLACEHOLDER = 'some day';
const EMAIL_PLACEHOLDER = 'someone';
const PHONE_PLACEHOLDER = 'someone';
const USERNAME_PLACEHOLDER = 'someone';
const HASHTAG_PLACEHOLDER = 'some tag';
const URL_PLACEHOLDER = 'some url';

function getPlaceholder(type) {
    if (type.isEntity) {
        switch (type.type) {
            case 'tt:email_address':
                return EMAIL_PLACEHOLDER;
            case 'tt:hashtag':
                return HASHTAG_PLACEHOLDER;
            case 'tt:url':
                return URL_PLACEHOLDER;
            case 'tt:phone_number':
                return PHONE_PLACEHOLDER;
            case 'tt:username':
                return USERNAME_PLACEHOLDER;
            case 'tt:picture':
                return PICTURE_PLACEHOLDER;
            return null;
        }
    } else if (type.isString)
        return STRING_PLACEHOLDER;
    else if (type.isNumber)
        return NUMBER_PLACEHOLDER;
    else if (type.isLocation)
        return LOCATION_PLACEHOLDER;
    else if (type.isDate)
        return DATE_PLACEHOLDER;
    else
        return null;
}

function timeToSEMPRE(jsArg) {
    var split = jsArg.split(':');
    return { hour: parseInt(split[0]), minute: parseInt(split[1]), second: 0,
        year: -1, month: -1, day: -1 };
}
function dateToSEMPRE(jsArg) {
    return { year: jsArg.getFullYear(), month: jsArg.getMonth() + 1, day: jsArg.getDate(),
        hour: jsArg.getHours(), minute: jsArg.getMinutes(), second: jsArg.getSeconds() };
}
function handleCompatEntityType(type) {
    switch (type.type) {
    case 'tt:username':
        return 'Username';
    case 'tt:hashtag':
        return 'Hashtag';
    case 'tt:picture':
        return 'Picture';
    case 'tt:email_address':
        return 'EmailAddress';
    case 'tt:phone_number':
        return 'PhoneNumber';
    case 'tt:url':
        return 'URL';
    default:
        return String(type);
    }
}
function valueToSEMPRE(value) {
    if (value.isEvent) {
        if (value.name)
            return ['VarRef', { id: 'tt:param.$event.' + value.name }];
        else
            return ['VarRef', { id: 'tt:param.$event' }];
    }
    if (value.isLocation && !value.value.isAbsolute)
        return ['Location', { relativeTag: 'rel_' + value.value.relativeTag, latitude: -1, longitude: -1 }];

    let jsArg = value.toJS();
    let type = value.getType();

    if (value.isBoolean)
        return ['Bool', { value: jsArg }];
    if (value.isString)
        return ['String', { value: jsArg }];
    if (value.isNumber)
        return ['Number', { value: jsArg }];
    if (value.isEntity)
        return [handleCompatEntityType(type), jsArg];
    if (value.isMeasure) // don't use jsArg as that normalizes the unit
        return ['Measure', { value: value.value, unit: value.unit }];
    if (value.isEnum)
        return ['Enum', { value: jsArg }];
    if (value.isTime)
        return ['Time', timeToSEMPRE(jsArg)];
    if (value.isDate)
        return ['Date', dateToSEMPRE(jsArg)];
    if (value.isLocation)
        return ['Location', { relativeTag: 'absolute', latitude: jsArg.y, longitude: jsArg.x, display: jsArg.display }];
    throw new TypeError('Unhandled type ' + type);
}

const gettext = new (require('node-gettext'));
gettext.setlocale('en-US');

function genPart(schemaRetriever, example, channelType, schemaType) {
    let prim = example.target_json[channelType];
    let [kind, channel] = handleSelector(prim);

    return schemaRetriever.getMeta(kind, schemaType, channel).then((schema) => {
        let argMap = {};
        let isInput = {};
        let isRequired = {};
        schema.args.forEach((arg, i) => {
            argMap[arg] = Type.fromString(schema.schema[i]);
            isInput[arg] = schema.is_input[i] || false;
            isRequired[arg] = schema.required[i] || false;
        });

        let args = [];
        let person = undefined;
        let sentence = example.utterance.replace(/\$([a-zA-Z\_]+)/g, (whole, argname) => {
            if (argname === '__person') {
                let value = uniform(Generate.genRandomValue(argname, Type.Entity('tt:contact_name')));
                person = value.value;
                return '@' + person;
            }

            let type = argMap[argname];
            if (!type)
                throw new Error(`Invalid argname ${argname} in ${kind}:${channel} (${example.id})`);
            let op = 'is';
            if (type.isArray) {
                type = type.elem;
                op = 'contains';
            }
            let valueList = Generate.genRandomValue(argname, type);
            let placeholder = getPlaceholder(type);
            if (valueList.length === 0)
                return placeholder || 'something';

            if (placeholder && isInput[argname] && isRequired[argname]) {
                if (coin(0.1))
                    return placeholder;
            }
            let value = uniform(valueList);
            let description = ThingTalk.Describe.describeArg(gettext, value);
            if (value.isDate) {
                value.value.setHours(0);
                value.value.setMinutes(0);
                value.value.setSeconds(0);
                description = value.value.toLocaleDateString();
            }

            let [sempreType, sempreValue] = valueToSEMPRE(value);
            args.push({ name: { id: 'tt:param.' + argname }, operator: op,
                        type: sempreType, value: sempreValue });
            return description;
        });

        let prog = { name: prim.name, person: person, args: args };
        return [prog, sentence];
    });
}

function genOne(output, schemaRetriever, triggers, queries, actions) {
    let structure = sample(STRUCTURE_DISTRIBUTION);

    let trigger = undefined, query = undefined, action = undefined;
    if (structure.indexOf('trigger') >= 0)
        trigger = genPart(schemaRetriever, uniform(triggers), 'trigger', 'triggers');
    if (structure.indexOf('query') >= 0)
        query = genPart(schemaRetriever, uniform(queries), 'query', 'queries');
    if (structure.indexOf('action') >= 0)
        action = genPart(schemaRetriever, uniform(actions), 'action', 'actions');

    return Promise.all([trigger, query, action]).then(([triggerRes, queryRes, actionRes]) => {
        let trigger, triggerSentence, query, querySentence, action, actionSentence;
        if (triggerRes)
            [trigger, triggerSentence] = triggerRes;
        if (queryRes)
            [query, querySentence] = queryRes;
        if (actionRes)
            [action, actionSentence] = actionRes;
        let template = uniform(TEMPLATES[structure]);
        if (triggerSentence)
            triggerSentence = triggerSentence.replace(/^when */i, '');
        if (querySentence)
            querySentence = querySentence.replace(/^(get|show) */i, '');
        let sentence = template.format(triggerSentence, querySentence, actionSentence);
        let rule = { rule: { trigger, query, action } };
        output.write([sentence, JSON.stringify(rule)]);
    });
}

function main() {
    let language = process.argv[2] || 'en';
    let N = parseInt(process.argv[3] || 2000);

    let file = fs.createWriteStream(process.argv[4] || 'output.tsv');
    let output = csv.stringify({ delimiter: '\t' });
    output.pipe(file);

    return db.withClient((dbClient) => {
        let schemaRetriever = new SchemaRetriever(dbClient, language);
        return getAllThingpediaSentences(dbClient, language).then((rows) => {
            let triggers = [];
            let queries = [];
            let actions = [];
            rows.forEach((row) => {
                row.target_json = JSON.parse(row.target_json);
                if (row.target_json.trigger)
                    triggers.push(row);
                else if (row.target_json.query)
                    queries.push(row);
                else
                    actions.push(row);
            });
            console.log(`Obtained ${triggers.length}x${queries.length}x${actions.length} to choose from`);

            let promises = [];
            for (let i = 0; i < N; i++)
                promises.push(genOne(output, schemaRetriever, triggers, queries, actions));
            return Promise.all(promises);
        });
    }).then(() => output.end()).done();

    file.on('finish', () => process.exit());
}
main();
