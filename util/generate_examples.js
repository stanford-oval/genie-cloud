// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');

const db = require('./db');
const schema = require('../model/schema');
const expandExamples = require('./expand_examples');
const exampleModel = require('../model/example');

function assignmentsToArgs(assignments, argtypes) {
    var args = [];

    for (var name in assignments) {
        if (assignments[name] === undefined)
            continue;
        var type = argtypes[name];
        var nameVal = { id: 'tt:param.' + name };
        if (type.isString || type.isNumber || type.isEmailAddress ||
            type.isPhoneNumber || type.isEnum || type.isURL ||
            type.isUsername || type.isHashtag)
            args.push({ name: nameVal, type: (type.isEnum ? 'Enum' : String(type)),
                        value: { value: assignments[name] },
                        operator: 'is' });
        else if (type.isMeasure)
            args.push({ name: nameVal, type: 'Measure',
                        value: { value: assignments[name][0],
                                 unit: assignments[name][1] },
                        operator: 'is' });
        else if (type.isBoolean)
            args.push({ name: nameVal, type: 'Bool',
                        value: { value: assignments[name] },
                        operator: 'is' });
        else if (type.isLocation)
            args.push({ name: nameVal, type: 'Location',
                        value: assignments[name],
                        operator: 'is' });
        else if (type.isDate)
            args.push({ name: nameVal, type: 'Date',
                        value: assignments[name],
                        operator: 'is' });
        else
            throw new TypeError('Unexpected type ' + type);
    }

    args.sort(function(a, b) {
        return a.name.id === b.name.id ? 0 : (a.name.id < b.name.id ? -1 : +1);
    });

    return args;
}

function exampleToExpanded(what, kind, actionName, assignments, argtypes) {
    var obj = {};
    obj[what] = { name: { id: 'tt:' + kind + '.' + actionName },
                  args: assignmentsToArgs(assignments, argtypes) };
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

            var argtypes = {};
            var argnames = fromChannel.params || fromChannel.args || [];
            argnames.forEach(function(name, i) {
                argtypes[name] = ThingTalk.Type.fromString(fromChannel.schema[i]);
            });

            fromChannel.examples.forEach(function(ex) {
                var slots = argnames.filter((name) => ex.indexOf('$' + name) >= 0);
                var json = exampleToBase(what, kind, name, slots);
                out.push({ schema_id: schemaId, is_base: true, utterance: ex, language: language,
                           target_json: JSON.stringify(json) });
            });

            try {
                var expanded = expandExamples(fromChannel.examples, argtypes);
                expanded.forEach(function(ex) {
                    var json = exampleToExpanded(what, kind, name, ex.assignments, argtypes);
                    out.push({ schema_id: schemaId, is_base: false, utterance: ex.utterance, language: language,
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
