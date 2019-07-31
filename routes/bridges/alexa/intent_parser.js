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
const TokenizerService = require('../../../util/tokenizer_service');
const resolveLocation = require('../../../util/location-linking');

const ThingpediaClient = require('../../../util/thingpedia-client');

function parseDate(form) {
    if (form instanceof Date)
        return form;

    let now = new Date;
    let year = form.year;
    if (year < 0 || year === undefined)
        year = now.getFullYear();
    let month = form.month;
    if (month < 0 || month === undefined)
        month = now.getMonth() + 1;
    let day = form.day;
    if (day < 0 || day === undefined)
        day = now.getDate();
    let hour = form.hour;
    if (hour < 0 || hour === undefined)
        hour = 0;
    let minute = form.minute;
    if (minute < 0 || minute === undefined)
        minute = 0;
    let second = form.second;
    if (second < 0 || second === undefined)
        second = 0;
    let millisecond = (second - Math.floor(second))*1000;
    second = Math.floor(second);

    return new Date(year, month-1, day, hour, minute, second, millisecond);
}

// Alexa's builtin entity resolution/linking is a total joke
// so we need to emulate pretty much everything here...
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
                new Ast.Value.Boolean(resolutions[0].values[0].value.id === 'true');
        } else if (type.isString) {
            entities[entityName] =
                new Ast.Value.String(alexaSlot.value);
        } else if (type.isNumber || type.isMeasure) {
            const tokenized = await TokenizerService.tokenize(language, alexaSlot.value);

            if (type.isNumber) {
                if (!('NUMBER_0' in tokenized.entities)) {
                    entities[entityName] = undefined;
                    continue;
                }
                entities[entityName] = new Ast.Value.Number(tokenized.entities.NUMBER_0);
            } else {
                // guess the unit, hope for the best...
                let unit = undefined;
                for (let i = 0; i < tokenized.tokens.length-1; i++) {
                    if (tokenized.tokens[i] === 'NUMBER_0') {
                        unit = tokenized.tokens[i+1];
                        break;
                    }
                }
                if (unit === undefined) {
                    entities[entityName] = undefined;
                    continue;
                }
                entities[entityName] = new Ast.Value.Measure(tokenized.entities.NUMBER_0, unit);
            }
        } else if (type.isEnum) {
            const resolutions = alexaSlot.resolutions.resolutionsPerAuthority[0];
            if (!resolutions || resolutions.length === 0) {
                entities[entityName] = undefined;
                continue;
            }
            entities[entityName] = new Ast.Value.Enum(resolutions[0].values[0].value.id);
        } else if (type.isTime) {
            const tokenized = await TokenizerService.tokenize(language, alexaSlot.value);
            if (!('TIME_0' in tokenized.entities)) {
                entities[entityName] = undefined;
                continue;
            }
            const time = tokenized.entities.TIME_0;
            entities[entityName] = new Ast.Value.Time(time.hour, time.minute, time.second||0);
        } else if (type.isCurrency) {
            const tokenized = await TokenizerService.tokenize(language, alexaSlot.value);
            if (!('CURRENCY_0' in tokenized.entities)) {
                entities[entityName] = undefined;
                continue;
            }
            const value = tokenized.entities.CURRENCY_0;
            entities[entityName] = new Ast.Value.Currency(value.value, value.unit);
        } else if (type.isDate) {
            const tokenized = await TokenizerService.tokenize(language, alexaSlot.value);
            if (!('DATE_0' in tokenized.entities)) {
                entities[entityName] = undefined;
                continue;
            }
            entities[entityName] = new Ast.Value.Date(parseDate(tokenized.entities.DATE_0, '+', null));
        } else if (type.isLocation) {
            const locations = (await resolveLocation(language, alexaSlot.value))
                // ignore locations larger than a city
                .filter((c) => c.rank <= 16);

            if (locations.length > 0)
                entities[entityName] = new Ast.Value.Location(new Ast.Location.Absolute(locations[0].latitude, locations[0].latitude, locations[0].display));
            else
                entities[entityName] = undefined;
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
