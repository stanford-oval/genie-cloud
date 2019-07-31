// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;

const I18n = require('../../../util/i18n');
const db = require('../../../util/db');
const exampleModel = require('../../../model/example');

const ThingpediaClient = require('../../../util/thingpedia-client');

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
        return new Ast.Value.CompoundMeasure(measures);
    else
        return measures[0];
}

// Alexa's builtin entity resolution/linking is very limited
// so we need to emulate a couple things here...
async function alexaSlotsToEntities(language, slotNames, slotTypes, alexaSlots) {
    const entities = {};

    for (let slotId = 0; slotId < slotNames.length; slotId ++) {
        const slotName = slotNames[slotId];
        const type = slotTypes[slotName];
        const alexaSlot = alexaSlots[slotName];
        const entityName = `SLOT_${slotId}`;
        if (alexaSlot === undefined) {
            entities[entityName] = undefined;
            continue;
        }

        if (type.isBoolean) {
            const resolutions = alexaSlot.resolutions.resolutionsPerAuthority[0];
            if (!resolutions || resolutions.length === 0) {
                entities[entityName] = undefined;
                continue;
            }
            entities[entityName] =
                new Ast.Value.Boolean(resolutions.values[0].value.id === 'true');
        } else if (type.isString) {
            entities[entityName] =
                new Ast.Value.String(alexaSlot.value);
        } else if (type.isEntity) {
            switch (type.type) {
            case 'tt:url':
            case 'tt:picture':
            case 'tt:hashtag':
            case 'tt:username':
                entities[entityName] =
                    new Ast.Value.Entity(alexaSlot.value, type.type, null);
                break;
            case 'tt:phone_number':
            case 'tt:email_address':
            case 'tt:contact':
                // assume that phone/emails have to be resolved against the user's contact book
                // so map these to a username
                entities[entityName] =
                    new Ast.Value.Entity(alexaSlot.value, 'tt:username', null);
                break;

            default:
                // everything else goes through entity resolution in the dialog agent
                entities[entityName] =
                    new Ast.Value.Entity(null, type.type, alexaSlot.value);
                break;
            }
        } else if (type.isNumber) {
            // the number comes normalized from Alexa
            entities[entityName] = new Ast.Value.Number(parseFloat(alexaSlot.value));
        } else if (type.isMeasure && type.unit === 'ms') {
            entities[entityName] = parseDuration(alexaSlot.value);
        } else if (type.isEnum) {
            const resolutions = alexaSlot.resolutions.resolutionsPerAuthority[0];
            if (!resolutions || resolutions.length === 0) {
                entities[entityName] = undefined;
                continue;
            }
            entities[entityName] = new Ast.Value.Enum(resolutions.values[0].value.id);
        } else if (type.isTime) {
            const [, hour, minute, second] = /^([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(alexaSlot.value);
            entities[entityName] = new Ast.Value.Time(parseInt(hour), parseInt(minute), parseInt(second)||0);
        } else if (type.isDate) {
            entities[entityName] = new Ast.Value.Date(parseDate(alexaSlot.value), '+', null);
        } else if (type.isLocation) {
            entities[entityName] = new Ast.Value.Location(new Ast.Location.Unresolved(alexaSlot.value));
        } else {
            throw new Error(`Unsupported slot type ${type}`);
        }
    }

    return entities;
}

async function applySlotsToProgram(schemaRetriever, locale, exampleRow, alexaSlots) {
    const language = I18n.localeToLanguage(locale);
    const dataset = `dataset @org.thingpedia language "${language}" { ${exampleRow.target_code} }`;
    const parsed = (await ThingTalk.Grammar.parseAndTypecheck(dataset, schemaRetriever, false)).datasets[0].examples[0];

    let slotNames = Object.keys(parsed.args);
    const program = parsed.toProgram();

    const entities = await alexaSlotsToEntities(locale, slotNames, parsed.args, alexaSlots);

    let code = ThingTalk.NNSyntax.toNN(program, {});
    return {
        example_id: exampleRow.id,
        code: code,
        entities: entities,
    };
}

async function getIntentFromDB(developerKey, locale, intent, alexaSlots) {
    const language = I18n.localeToLanguage(locale);

    const dot = intent.lastIndexOf('.');
    const device = intent.substring(0, dot);
    const name = intent.substring(dot+1);

    return db.withTransaction(async (dbClient) => {
        const tpClient = new ThingpediaClient(developerKey, locale, dbClient);
        const schemaRetriever = new ThingTalk.SchemaRetriever(tpClient, null, true);

        const row = await exampleModel.getByIntentName(dbClient, language, device, name);
        return applySlotsToProgram(schemaRetriever, locale, row, alexaSlots);
    });
}

async function requestToThingTalk(developerKey, locale, body) {
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
        return getIntentFromDB(developerKey, locale, intent.name, intent.slots);
    }
}

module.exports = {
    requestToThingTalk,
    applySlotsToProgram
};
