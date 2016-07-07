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
const tokenize = require('./tokenize');

function assignmentsToArgs(assignments, argtypes) {
    var args = [];

    for (var name in assignments) {
        var type = argtypes[name];
        var nameVal = { id: 'tt.param.' + name };
        if (type.isString)
            args.push({ name: nameVal, type: 'String', value: { value: assignments[name] },
                        operator: 'is' });
        else if (type.isNumber)
            args.push({ name: nameVal, type: 'Number', value: { value: String(assignments[name]) },
                        operator: 'is' });
        else if (type.isMeasure)
            args.push({ name: nameVal, type: 'Measure', value: { value: String(assignments[name][0]) },
                        unit: assignments[name][1],
                        operator: 'is' });
        else if (type.isBoolean)
            args.push({ name: nameVal, type: 'Bool', value: { value: String(assignments[name]) },
                        operator: 'is' });
        else
            throw new TypeError();
    }

    return args;
}

function exampleToAction(kind, actionName, assignments, argtypes) {
    return {
        action: { name: { id: 'tt:' + kind + '.' + actionName },
                  args: assignmentsToArgs(assignments, argtypes) }
    }
}

function exampleToQuery(kind, queryName, assignments, argtypes) {
    return {
        query: { name: { id: 'tt:' + kind + '.' + queryName },
                 args: assignmentsToArgs(assignments, argtypes) }
    }
}

function exampleToTrigger(kind, triggerName, assignments, argtypes) {
    return {
        trigger: { name: { id: 'tt:' + kind + '.' + triggerName },
                   args: assignmentsToArgs(assignments, argtypes) }
    }
}

function tokensToSlots(tokens) {
    return tokens.filter((t) => t.startsWith('$')).map((t) => t.substr(1));
}

function exampleToBaseAction(kind, actionName, tokens) {
    return {
        action: { name: { id: 'tt:' + kind + '.' + actionName },
                  args: [], slots: tokensToSlots(tokens) }
    }
}

function exampleToBaseQuery(kind, queryName, tokens) {
    return {
        query: { name: { id: 'tt:' + kind + '.' + queryName },
                 args: [], slots: tokensToSlots(tokens) }
    }
}

function exampleToBaseTrigger(kind, triggerName, tokens) {
    return {
        trigger: { name: { id: 'tt:' + kind + '.' + triggerName },
                   args: [], slots: tokensToSlots(tokens) }
    }
}

function ensureExamples(dbClient, ast) {
    if (!ast['global-name'])
        return;


}

module.exports = function(dbClient, kind, ast) {
        function handleExamples(schemaId, from, howBase, howExpanded, out) {
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
                var tokens = tokenize.tokenize(ex);
                var json = howBase(kind, name, tokens);
                out.push({ schema_id: schemaId, is_base: true, utterance: ex,
                           target_json: JSON.stringify(json) });
            });

            try {
                var expanded = expandExamples(fromChannel.examples, argtypes);
                expanded.forEach(function(ex) {
                    var json = howExpanded(kind, name, ex.assignments, argtypes);
                    out.push({ schema_id: schemaId, is_base: false, utterance: ex.utterance,
                               target_json: JSON.stringify(json) });
                });
            } catch(e) {
                console.log('Failed to expand examples: ' + e.message);
            }
        }
    }

    function generateAllExamples(schemaId) {
        var out = [];

        handleExamples(schemaId, ast.actions, exampleToBaseAction, exampleToAction, out);
        handleExamples(schemaId, ast.queries, exampleToBaseQuery, exampleToQuery, out);
        handleExamples(schemaId, ast.triggers, exampleToBaseTrigger, exampleToTrigger, out);

        return out;
    }

    return schema.getByKind(dbClient, kind).then(function(existing) {
        return exampleModel.deleteBySchema(dbClient, existing.id).then(function() {
            var examples = generateAllExamples(existing.id);
            if (examples.length > 0)
                return exampleModel.createMany(dbClient, examples);
        });
    });
}
