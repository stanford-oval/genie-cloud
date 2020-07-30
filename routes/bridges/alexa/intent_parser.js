// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const Type = ThingTalk.Type;

const I18n = require('../../../util/i18n');
const exampleModel = require('../../../model/example');

function parseDate(form) {
    let match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(form);
    if (match !== null) {
        const [, year, month, day] = match;
        return new Date(parseInt(year), parseInt(month)-1, parseInt(day));
    }

    match = /^([0-9]{4})-W([0-9]{1,2})(-WE)?$/.exec(form);
    if (match !== null) // FIXME
        throw new Error(`week numbers and week dates are not implemented`);

    match = /^([0-9]{4})-([0-9]{2})(-XX)?$/.exec(form);
    if (match !== null) {
        const [, year, month] = match;
        return new Date(parseInt(year), parseInt(month)-1, 1);
    }

    match = /^([0-9]{4})(-XX-XX)?$/.exec(form);
    if (match !== null) {
        const [, year] = match;
        return new Date(parseInt(year), 0, 1);
    }

    throw new Error(`unsupported date value ${form}`);
}

function parseDuration(form) {
    const match = /^P([0-9]+Y)?([0-9]+M)?([0-9]+D)?T?([0-9]+H)?([0-9]+M)?([0-9]+S)?/.exec(form);

    const [, year, month, day, hour, minute, second] = match;

    const measures = [];
    if (year)
        measures.push(new Ast.Value.Measure(parseInt(year), 'year'));
    if (month)
        measures.push(new Ast.Value.Measure(parseInt(month), 'mon'));
    if (day)
        measures.push(new Ast.Value.Measure(parseInt(day), 'day'));
    if (hour)
        measures.push(new Ast.Value.Measure(parseInt(hour), 'hour'));
    if (minute)
        measures.push(new Ast.Value.Measure(parseInt(minute), 'min'));
    if (second)
        measures.push(new Ast.Value.Measure(parseInt(second), 's'));

    if (measures.length === 0)
        throw new Error(`invalid duration value ${form}`);

    if (measures.length > 1)
        return new Ast.Value.Computation('+', measures, [Type.Measure('ms'), Type.Measure('ms'), Type.Measure('ms')], Type.Measure('ms'));
    else
        return measures[0];
}

// Alexa's builtin entity resolution/linking is very limited
// so we need to emulate a couple things here...
function alexaSlotToThingTalk(type, alexaSlot) {
    if (alexaSlot === undefined)
        return new Ast.Value.Undefined(true);

    if (type.isBoolean) {
        const resolutions = alexaSlot.resolutions.resolutionsPerAuthority[0];
        if (!resolutions || resolutions.length === 0)
            return new Ast.Value.Undefined(true);
        return new Ast.Value.Boolean(resolutions.values[0].value.id === 'true');
    } else if (type.isString) {
        return new Ast.Value.String(alexaSlot.value);
    } else if (type.isEntity) {
        switch (type.type) {
        case 'tt:url':
        case 'tt:picture':
        case 'tt:hashtag':
        case 'tt:username':
            return new Ast.Value.Entity(alexaSlot.value, type.type, null);

        case 'tt:phone_number':
        case 'tt:email_address':
        case 'tt:contact':
            // assume that phone/emails have to be resolved against the user's contact book
            // so map these to a username
            return new Ast.Value.Entity(alexaSlot.value, 'tt:username', null);

        default:
            // everything else goes through entity resolution in the dialog agent
            return new Ast.Value.Entity(null, type.type, alexaSlot.value);
        }
    } else if (type.isNumber) {
        // the number comes normalized from Alexa
        return new Ast.Value.Number(parseFloat(alexaSlot.value));
    } else if (type.isMeasure && type.unit === 'ms') {
        return parseDuration(alexaSlot.value);
    } else if (type.isEnum) {
        const resolutions = alexaSlot.resolutions.resolutionsPerAuthority[0];
        if (!resolutions || resolutions.length === 0)
            return new Ast.Value.Undefined(true);
        return new Ast.Value.Enum(resolutions.values[0].value.id);
    } else if (type.isTime) {
        const [, hour, minute, second] = /^([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(alexaSlot.value);
        return new Ast.Value.Time(parseInt(hour), parseInt(minute), parseInt(second)||0);
    } else if (type.isDate) {
        return new Ast.Value.Date(parseDate(alexaSlot.value), '+', null);
    } else if (type.isLocation) {
        return new Ast.Value.Location(new Ast.Location.Unresolved(alexaSlot.value));
    } else {
        throw new Error(`Unsupported slot type ${type}`);
    }
}

function applySlotsToProgram(locale, exampleCode, alexaSlots) {
    const language = I18n.localeToLanguage(locale);
    const dataset = `dataset @org.thingpedia language "${language}" { ${exampleCode} }`;
    const parsed = ThingTalk.Grammar.parse(dataset).datasets[0].examples[0];

    const program = parsed.toProgram();
    const slotNames = Object.keys(parsed.args);

    for (let slot of program.iterateSlots2()) {
        if (slot instanceof Ast.Selector)
            continue;

        const value = slot.get();
        if (!value.isVarRef || !value.name.startsWith('__const_SLOT_'))
            continue;

        const slotIndex = parseInt(value.name.substring('__const_SLOT_'.length));
        const name = slotNames[slotIndex];
        const type = parsed.args[name];
        slot.set(alexaSlotToThingTalk(type, alexaSlots[name]));
    }

    return program.prettyprint();
}

async function getIntentFromDB(dbClient, locale, intent, alexaSlots) {
    const language = I18n.localeToLanguage(locale);

    const dot = intent.lastIndexOf('.');
    const device = intent.substring(0, dot);
    const name = intent.substring(dot+1);

    const row = await exampleModel.getByIntentName(dbClient, language, device, name);
    return { program: applySlotsToProgram(locale, row.target_code, alexaSlots) };
}

async function requestToThingTalk(dbClient, locale, body) {
    if (body.request.type === 'SessionEndedRequest')
        return { program: 'bookkeeping(special(nevermind))' };
    else if (body.request.type === 'LaunchRequest')
        return { program: 'bookkeeping(special(wakeup))' };
    else if (body.request.type !== 'IntentRequest')
        throw new Error('Invalid request type ' + body.request.type);

    const intent = body.request.intent;

    switch (intent.name) {
    case 'AMAZON.StopIntent':
        return { program: 'bookkeeping(special(nevermind))' };

    case 'org.thingpedia.command':
        return { text: intent.slots.command };

    default:
        return getIntentFromDB(dbClient, locale, intent.name, intent.slots);
    }
}

module.exports = {
    requestToThingTalk,
    applySlotsToProgram
};
