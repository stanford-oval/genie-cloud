// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const tkutils = require('./tokenize');

// intentionally use strings that don't
function identityMap(array) {
    return array.map((e) => [e, e]);
}

const STRING_ARGUMENTS = identityMap(['abc def', 'ghi jkl', 'mno pqr', 'stu vwz']);
const NUMBER_ARGUMENTS = identityMap([42, 7, 14]);
const MEASURE_ARGUMENTS = {
    C: [['73 F', [73, 'F']], ['22 C', [22, 'C']]],
    m: [['1000 m', [1000, 'm']], ['42 cm', [42, 'cm']]],
    kg: [['82 kg', [82, 'kg']], ['155 lb', [155, 'lb']]],
};
const PICTURE_ARGUMENTS = identityMap(['$URL']); // special token
const BOOLEAN_ARGUMENTS = [['true', true], ['false', false],
                           ['yes', true], ['no', false],
                           ['on', true], ['off', false]];

function expandOne(example, argtypes, into) {
    var tokens = tkutils.tokenize(example);
    var expanded = [];
    var assignments = {};

    function expandRecursively(i) {
        if (i === tokens.length) {
            var copy = {};
            Object.assign(copy, assignments);
            return into.push({ utterance: tkutils.rejoin(expanded),
                               assignments: copy });
        }

        if (!tokens[i].startsWith('$')) {
            expanded[i] = tokens[i];
            return expandRecursively(i+1);
        }
        var argname = tokens[i].substr(1);
        if (assignments[argname]) {
            expanded[i] = assignments[argname];
            return expandRecursively(i+1);
        }

        var argtype = argtypes[argname];
        if (!argtype)
            throw new TypeError('Unrecognized placeholder ' + tokens[i]);

        var choices;
        if (argtype.isString)
            choices = STRING_ARGUMENTS;
        else if (argtype.isNumber)
            choices = NUMBER_ARGUMENTS;
        else if (argtype.isMeasure)
            choices = MEASURE_ARGUMENTS[argtype.unit];
        else if (argtype.isBoolean)
            choices = BOOLEAN_ARGUMENTS;
        else if (argtype.isPicture)
            choices = PICTURE_ARGUMENTS;

        if (!choices)
            throw new TypeError('Cannot expand placeholder ' + tokens[i] + ' of type ' + argtype);

        choices.forEach(function(c) {
            expanded[i] = c[0];
            assignments[argname] = c[1];
            expandRecursively(i+1);
            assignments[argname] = undefined;
        });
    }

    return expandRecursively(0);
}

module.exports = function expandExamples(examples, argtypes) {
    var into = [];

    examples.forEach(function(ex) {
        expandOne(ex, argtypes, into);
    });

    return into;
}
