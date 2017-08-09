// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;

const db = require('./db');
const schema = require('../model/schema');
const expandExamples = require('./expand_examples');
const exampleModel = require('../model/example');

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

function assignmentsToArgs(assignments, argtypes) {
    var args = [];

    for (var name in assignments) {
        if (name === '__person')
            continue;
        if (assignments[name] === undefined || assignments[name].isUndefined)
            continue;
        let type = argtypes[name];
        let operator = 'is';
        if (type.isArray) {
            operator = 'contains';
            type = type.elem;
        }
        let nameVal = { id: 'tt:param.' + name };

        let [sempreType, sempreValue] = valueToSEMPRE(assignments[name]);
        args.push({ name: nameVal, type: sempreType,
                    value: sempreValue,
                    operator: operator });
    }

    return args;
}

function exampleToExpanded(what, kind, actionName, assignments, argtypes) {
    var obj = {};
    obj[what] = { name: { id: 'tt:' + kind + '.' + actionName },
                  args: assignmentsToArgs(assignments, argtypes) };
    if (assignments.__person)
        obj[what].person = assignments.__person.value;
    return obj;
}

function exampleToBase(what, kind, actionName, slots) {
    var obj = {};
    obj[what] = { name: { id: 'tt:' + kind + '.' + actionName },
                  args: [], slots: slots };
    return obj;
}

module.exports = function(dbClient, kind, ast, language) {
    language = language || 'en';

    function handleExamples(schemaId, from, what, out) {
        for (var name in from) {
            var fromChannel = from[name];
            if (!Array.isArray(fromChannel.examples))
                continue;

            var argtypes = {
                '__person': Type.Entity('tt:contact_name')
            };
            var argrequired = {
                '__person': false
            };
            var argnames = ['__person'];
            fromChannel.args.forEach((arg) => {
                argnames.push(arg.name);
                argtypes[arg.name] = ThingTalk.Type.fromString(arg.type);
                argrequired[arg.name] = (arg.required || what === 'action');
            });

            fromChannel.examples.forEach(function(ex) {
                var slots = argnames.filter((name) => ex.indexOf('$' + name) >= 0);
                var json = exampleToBase(what, kind, name, slots);
                out.push({ schema_id: schemaId, is_base: true, utterance: ex, language: language,
                           target_json: JSON.stringify(json) });
            });

            try {
                var expanded = expandExamples(fromChannel.examples, argtypes, argrequired);
                expanded.forEach(function(ex) {
                    var json = exampleToExpanded(what, kind, name, ex.assignments, argtypes);
                    out.push({ schema_id: schemaId, is_base: false,
                               utterance: ex.utterance, language: language,
                               target_json: JSON.stringify(json) });
                });
            } catch(e) {
                console.log('Failed to expand examples: ' + e.message);
            }
        }
    }

    function generateAllExamples(schemaId) {
        var out = [];

        handleExamples(schemaId, ast.actions, 'action', out);
        handleExamples(schemaId, ast.queries, 'query', out);
        handleExamples(schemaId, ast.triggers, 'trigger', out);

        return out;
    }

    return schema.getByKind(dbClient, kind).then(function(existing) {
        return exampleModel.deleteBySchema(dbClient, existing.id, language).then(function() {
            var examples = generateAllExamples(existing.id);
            if (examples.length > 0)
                return exampleModel.createMany(dbClient, examples);
        });
    });
}
