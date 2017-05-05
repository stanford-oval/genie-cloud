// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const Q = require('q');

const ThingTalk = require('thingtalk');

const KIND_REGEX = /^[A-Za-z_][A-Za-z0-9_-]*$/;

module.exports = {
    validateKind(name, what) {
        if (!KIND_REGEX.test(name))
            throw new Error('Invalid ' + what + ', must conform to ' + KIND_REGEX);
    },

    validateInvocation(where, what) {
        for (var name in where) {
            if (!where[name].canonical)
                throw new Error('Missing canonical form for ' + name);
            if (!where[name].confirmation || !where[name].confirmation_remote)
                throw new Error('Missing confirmation for ' + name);
            if (!where[name].examples || where[name].examples.length === 0)
                throw new Error('Must include at least one example in ' + name);
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
                if (arg.required && !arg.question)
                    throw new Error('Required argument ' + name + '.' + arg.name + ' must have a slot filling question');
            }
        }
    },

    validateAllInvocations(ast) {
        if (!ast.triggers)
            ast.triggers = {};
        if (!ast.actions)
            ast.actions = {};
        if (!ast.queries)
            ast.queries = {};
        this.validateInvocation(ast.triggers, 'trigger');
        this.validateInvocation(ast.actions, 'action');
        this.validateInvocation(ast.queries, 'query');
    }
}
