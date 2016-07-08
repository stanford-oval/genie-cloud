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

module.exports = {
    validateInvocation(where, what) {
        for (var name in where) {
            if (!where[name].schema)
                throw new Error("Missing " + what + " schema for " + name);
            if ((where[name].args && where[name].args.length !== where[name].schema.length) ||
                (where[name].params && where[name].params.length !== where[name].schema.length))
                throw new Error("Invalid number of arguments in " + what + " " + name);
            if (where[name].questions && where[name].questions.length !== where[name].schema.length)
                throw new Error("Invalid number of questions in " + name);
            if (where[name].required && where[name].required.length > where[name].schema.length)
                throw new Error("Invalid number of required arguments in " + name);
            if (where[name].required) {
                where[name].required.forEach(function(argrequired, i) {
                    if (argrequired && (!where[name].questions || !where[name].questions[i]))
                        throw new Error('Required arguments in ' + name + ' must have slot filling questions');
                });
            }
            where[name].schema.forEach(function(t) {
                ThingTalk.Type.fromString(t);
            });
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
