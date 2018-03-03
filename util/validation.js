// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');

const KIND_REGEX = /^[A-Za-z_][A-Za-z0-9_-]*$/;

module.exports = {
    cleanKind(kind) {
        // convert security-camera to 'security camera' and googleDrive to 'google drive'

        // thingengine.phone -> phone
        if (kind.startsWith('org.thingpedia.builtin.thingengine.'))
            kind = kind.substr('org.thingpedia.builtin.thingengine.'.length);
        // org.thingpedia.builtin.omlet -> omlet
        if (kind.startsWith('org.thingpedia.builtin.'))
            kind = kind.substr('org.thingpedia.builtin.'.length);
        // org.thingpedia.weather -> weather
        if (kind.startsWith('org.thingpedia.'))
            kind = kind.substr('org.thingpedia.'.length);
        // com.xkcd -> xkcd
        if (kind.startsWith('com.'))
            kind = kind.substr('com.'.length);
        if (kind.startsWith('gov.'))
            kind = kind.substr('gov.'.length);
        if (kind.startsWith('org.'))
            kind = kind.substr('org.'.length);
        if (kind.startsWith('uk.co.'))
            kind = kind.substr('uk.co.'.length);

        return kind.replace(/[_\-.]/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
    },

    validateKind(name, what) {
        if (!KIND_REGEX.test(name))
            throw new Error('Invalid ' + what + ', must conform to ' + KIND_REGEX);
    },

    validateInvocation(where, what) {
        for (var name in where) {
            if (!where[name].canonical)
                throw new Error('Missing canonical form for ' + name);
            if (!where[name].confirmation)
                throw new Error('Missing confirmation for ' + name);
            if (where[name].examples)
                throw new Error('Examples should be at the toplevel, not under ' + name);
            where[name].doc = where[name].doc || '';
            where[name].args = where[name].args || [];

            for (var arg of where[name].args) {
                if (!arg.name)
                    throw new Error('Missing argument name in ' + name);
                if (!arg.type)
                    throw new Error("Missing type for argument " + name + '.' + arg.name);
                try {
                    ThingTalk.Type.fromString(arg.type);
                } catch(e) {
                    throw new Error('Invalid type ' + arg.type + ' for argument ' + name + '.' + arg.name);
                }
                arg.question = arg.question || '';
                arg.required = arg.required || false;
                arg.is_input = arg.is_input || false;
                if (!arg.is_input && what === 'action')
                    throw new Error('Action ' + name + ' cannot have output argument ' + arg.name);
                if (arg.required && !arg.question)
                    throw new Error('Required argument ' + name + '.' + arg.name + ' must have a slot filling question');
                if (arg.required && !arg.is_input)
                    throw new Error('Argument ' + name + '.' + arg.name + ' cannot be both output and required');
            }
        }
    },

    validateAllInvocations(ast) {
        if (!ast.actions)
            ast.actions = {};
        if (!ast.queries)
            ast.queries = {};
        if (ast.triggers && Object.keys(ast.triggers).length > 0)
            throw new Error("Triggers don't exist any more, delete all of them");

        this.validateInvocation(ast.actions, 'action');
        this.validateInvocation(ast.queries, 'query');

        if (!ast.examples)
            ast.examples = [];

        for (let ex of ast.examples) {
            if (!ex.utterance || !ex.program)
                throw new Error("Invalid example");
            ex.program = ThingTalk.Ast.prettyprint(ThingTalk.Grammar.parse(ex.program), true).trim();
        }
    }
};
