// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// intentionally use strings that don't
function identityMap(array) {
    return array.map((e) => [e, e]);
}

const STRING_ARGUMENTS = [['"abc def"', 'abc def'], ['"ghi jkl"', 'ghi jkl'], ['"mno pqr"', 'mno pqr'], ['"stu vwz"', 'stu vwz']];
const STRING_PLACEHOLDER = 'something';
const NUMBER_ARGUMENTS = identityMap([42, 7, 14]);
const NUMBER_PLACEHOLDER = 'some number';
const MEASURE_ARGUMENTS = {
    C: [['73 F', [73, 'F']], ['22 C', [22, 'C']]],
    m: [['1000 m', [1000, 'm']], ['42 cm', [42, 'cm']]],
    kg: [['82 kg', [82, 'kg']], ['155 lb', [155, 'lb']]],
    ms: [['1 day', [1, 'day']], ['5 hours', [5, 'h']]]
};
const PICTURE_ARGUMENTS = identityMap(['$URL']); // special token
const PICTURE_PLACEHOLDER = 'some picture';
const BOOLEAN_ARGUMENTS = [['true', true], ['false', false],
                           ['yes', true], ['no', false],
                           ['on', true], ['off', false]];
// the sentence here is "turn $power my tv" => "turn some way my tv"
// maybe not that useful
const BOOLEAN_PLACEHOLDER = 'some way';
const LOCATION_ARGUMENTS = [['here', { relativeTag: 'rel_current_location', latitude: -1, longitude: -1 }],
                            ['home', { relativeTag: 'rel_home', latitude: -1, longitude: -1 }],
                            ['work', { relativeTag: 'rel_work', latitude: -1, longitude: -1 }],
                            ['palo alto', { relativeTag: 'absolute', latitude: 37.442156, longitude: -122.1634471 }],
                            ['los angeles', { relativeTag: 'absolute', latitude:    34.0543942, longitude: -118.2439408 }]];
const LOCATION_PLACEHOLDER = 'some place';
const DATE_ARGUMENTS = [['feb 14th 2017', { year: 2017, month: 2, day: 14, hour: 0, minute: 0, second: 0 }],
    ['may 4th 2016', { year: 2016, month: 5, day: 4, hour: 0, minute: 0, second: 0 }]];
const DATE_PLACEHOLDER = 'some day';
const EMAIL_ARGUMENTS = identityMap(['nobody@stanford.edu', 'somebody@example.com']);
const EMAIL_PLACEHOLDER = 'someone';
const PHONE_ARGUMENTS = [['1-555-555-5555', '+15555555555'], ['1-800-SABRINA', '+18007227462']];
const PHONE_PLACEHOLDER = 'someone';
const USERNAME_ARGUMENTS = [['@foo', 'foo'], ['@bar', 'bar']];
const USERNAME_PLACEHOLDER = 'someone';
const HASHTAG_ARGUMENTS = [['#foo', 'foo'], ['#bar', 'bar']];
const HASHTAG_PLACEHOLDER = 'some tag';
const URL_ARGUMENTS = identityMap(['http://www.google.com']);
const URL_PLACEHOLDER = 'some url';

const ENTITIES = {
    'sportradar:eu_soccer_team': [[["Juventus", "juv"], ["Barcelona", "bar"], ["Bayern Munich", "fcb"]], 'some team'],
    'sportradar:mlb_team': [[["SF Giants", 'sf'], ["Chicago Cubs", 'chc']], 'some team'],
    'sportradar:nba_team': [[["Golden State Warriors", 'gsw'], ["LA Lakers", 'lal']], 'some team'],
    'sportradar:ncaafb_team': [[["Stanford Cardinals", 'sta'], ["California Bears", 'cal']], 'some team'],
    'sportradar:ncaambb_team': [[["Stanford Cardinals", 'stan'], ["California Bears", 'cal']], 'some team'],
    'sportradar:nfl_team': [[["Seattle Seahawks", 'sea'], ["SF 49ers", 'sf']], 'some team'],
    'sportradar:us_soccer_team': [[["San Jose Earthquakes", 'sje'], ["Toronto FC", 'tor']], 'some team'],
    'tt:stock_id': [[["Google", 'goog'], ["Apple", 'aapl'], ['Microsoft', 'msft'], ['Red Hat', 'rht']], 'some company']
};

function chooseEntity(entityType) {
    if (entityType === 'tt:email_address')
        return [EMAIL_ARGUMENTS, EMAIL_PLACEHOLDER];
    if (entityType === 'tt:phone_number')
        return [PHONE_ARGUMENTS, PHONE_PLACEHOLDER];
    if (entityType === 'tt:username')
        return [USERNAME_ARGUMENTS, USERNAME_PLACEHOLDER];
    if (entityType === 'tt:hashtag')
        return [HASHTAG_ARGUMENTS, HASHTAG_PLACEHOLDER];
    if (entityType === 'tt:url')
        return [URL_ARGUMENTS, URL_PLACEHOLDER];
    if (entityType === 'tt:picture')
        return [PICTURE_ARGUMENTS, PICTURE_PLACEHOLDER];

    var choices = ENTITIES[entityType];
    if (!choices) {
        console.log('Unrecognized entity type ' + entityType);
        return [null, null];
    }
    return choices;
}

function extractArgNames(example) {
    var names = [];

    var regexp = /\$([a-zA-Z\_]+)/g;
    var match = regexp.exec(example);
    while (match != null) {
        names.push(match[1]);
        match = regexp.exec(example);
    }
    return names;
}

function clean(name) {
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
}

function makeEnumChoices(choices) {
    return choices.map((c) => {
        return [clean(c), c];
    });
}

function expandOne(example, argtypes, into) {
    var argnames = extractArgNames(example);
    var assignments = {};

    function expandRecursively(expanded, i, forcePlaceholder) {
        if (i === argnames.length) {
            var copy = {};
            Object.assign(copy, assignments);
            return into.push({ utterance: expanded,
                               assignments: copy });
        }

        var argname = argnames[i];
        var argtype = argtypes[argname];
        if (!argtype)
            throw new TypeError('Invalid placeholder $' + argname);

        var choices, placeholder;
        if (argtype.isEntity) {
            [choices, placeholder] = chooseEntity(argtype.type);
        } else if (argtype.isString) {
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
        } else if (argtype.isDate) {
            choices = DATE_ARGUMENTS;
            placeholder = DATE_PLACEHOLDER;
        } else if (argtype.isEnum) {
            choices = makeEnumChoices(argtype.entries);
            placeholder = undefined;
        } else if (argtype.isEmailAddress) {
            choices = EMAIL_ARGUMENTS;
            placeholder = EMAIL_PLACEHOLDER;
        } else if (argtype.isPhoneNumber) {
            choices = PHONE_ARGUMENTS;
            placeholder = PHONE_PLACEHOLDER;
        } else if (argtype.isUsername) {
            choices = USERNAME_ARGUMENTS;
            placeholder = USERNAME_PLACEHOLDER;
        } else if (argtype.isHashtag) {
            choices = HASHTAG_ARGUMENTS;
            placeholder = HASHTAG_PLACEHOLDER;
        } else if (argtype.isURL) {
            choices = URL_ARGUMENTS;
            placeholder = URL_PLACEHOLDER;
        }

        if (!choices)
            throw new TypeError('Cannot expand placeholder $' + argname + ' of type ' + argtype);

        var argnameRegex = '\\$' + argname;

        if (!forcePlaceholder) {
            choices.forEach(function(c) {
                assignments[argname] = c[1];
                expandRecursively(expanded.replace(new RegExp(argnameRegex, 'g'), c[0]), i+1, false);
                assignments[argname] = undefined;
            });
        }

        if (placeholder) {
            // make one with lexical placeholders with no assignments
            // the goal is to have utterances like
            // "tweet something" in addition to "tweet abc def"
            // where the latter would be slot filled
            // the reason is that the NL is a lot happier with no
            // arguments
            expandRecursively(expanded.replace(new RegExp(argnameRegex, 'g'), placeholder), i+1, true);
        }
    }

    return expandRecursively(example, 0, false);
}

module.exports = function expandExamples(examples, argtypes) {
    var into = [];

    examples.forEach(function(ex) {
        expandOne(ex, argtypes, into);
    });

    return into;
}
