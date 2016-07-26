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

const STRING_ARGUMENTS = identityMap(['"abc def"', '"ghi jkl"', 'mno pqr', 'stu vwz']);
const STRING_PLACEHOLDER = 'something';
const NUMBER_ARGUMENTS = identityMap([42, 7, 14]);
const NUMBER_PLACEHOLDER = 'some number';
const MEASURE_ARGUMENTS = {
    C: [['73 F', [73, 'F']], ['22 C', [22, 'C']]],
    m: [['1000 m', [1000, 'm']], ['42 cm', [42, 'cm']]],
    kg: [['82 kg', [82, 'kg']], ['155 lb', [155, 'lb']]],
    ms: ['1 day', [1, 'day'], ['a fortnight', [14, 'day']], ['5 hours', [5, 'hour']]]
};
const PICTURE_ARGUMENTS = identityMap(['$URL']); // special token
const PICTURE_PLACEHOLDER = 'some picture';
const BOOLEAN_ARGUMENTS = [['true', true], ['false', false],
                           ['yes', true], ['no', false],
                           ['on', true], ['off', false]];
// the sentence here is "turn $power my tv" => "turn some way my tv"
// maybe not that useful
const BOOLEAN_PLACEHOLDER = 'some way';
const LOCATION_ARGUMENTS = [['here', { relativeTag: 'rel_current_location' }],
                            ['home', { relativeTag: 'rel_home' }],
                            ['work', { relativeTag: 'rel_work' }],
                            ['palo alto', { relativeTag: 'absolute', latitude: 37.442156, longitude: -122.1634471 }],
                            ['los angeles', { relativeTag: 'absolute', latitude: 34.0543942, longitude: -118.2439408 }]];
const LOCATION_PLACEHOLDER = 'some place';

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

        var choices, placeholder;
        if (argtype.isString) {
            choices = STRING_ARGUMENTS;
            placeholder = STRING_PLACEHOLDER;
        } else if (argtype.isNumber) {
            choices = NUMBER_ARGUMENTS;
            placeholder = NUMBER_PLACEHOLDER;
        } else if (argtype.isMeasure) {
            choices = MEASURE_ARGUMENTS[argtype.unit];
            placeholder = NUMBER_PLACEHOLDER;
        } else if (argtype.isBoolean) {
            choices = BOOLEAN_ARGUMENTS;
            placeholder = BOOLEAN_PLACEHOLDER;
        } else if (argtype.isPicture) {
            choices = PICTURE_ARGUMENTS;
            placeholder = PICTURE_PLACEHOLDER;
        } else if (argtype.isLocation) {
            choices = LOCATION_ARGUMENTS;
            placeholder = LOCATION_PLACEHOLDER;
        }

        if (!choices)
            throw new TypeError('Cannot expand placeholder ' + tokens[i] + ' of type ' + argtype);

        choices.forEach(function(c) {
            expanded[i] = c[0];
            assignments[argname] = c[1];
            expandRecursively(i+1);
            assignments[argname] = undefined;
        });

        // make one with lexical placeholders with no assignments
        // the goal is to have utterances like
        // "tweet something" in addition to "tweet abc def"
        // where the latter would be slot filled
        // the reason is that the NL is a lot happier with no
        // arguments
        expanded[i] = placeholder;
        expandRecursively(i+1);
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
