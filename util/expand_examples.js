// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');

const STRING_PLACEHOLDER = 'something';
const NUMBER_PLACEHOLDER = 'some number';
const PICTURE_PLACEHOLDER = 'some picture';
const LOCATION_PLACEHOLDER = 'some place';
const DATE_PLACEHOLDER = 'some day';
const EMAIL_PLACEHOLDER = 'someone';
const PHONE_PLACEHOLDER = 'someone';
const USERNAME_PLACEHOLDER = 'someone';
const HASHTAG_PLACEHOLDER = 'some tag';
const URL_PLACEHOLDER = 'some url';

function getPlaceholder(type) {
    if (type.isEntity) {
        switch (type.type) {
            case 'tt:email_address':
                return EMAIL_PLACEHOLDER;
            case 'tt:hashtag':
                return HASHTAG_PLACEHOLDER;
            case 'tt:url':
                return URL_PLACEHOLDER;
            case 'tt:phone_number':
                return PHONE_PLACEHOLDER;
            case 'tt:username':
                return USERNAME_PLACEHOLDER;
            case 'tt:picture':
                return PICTURE_PLACEHOLDER;
            return null;
        }
    } else if (type.isString)
        return STRING_PLACEHOLDER;
    else if (type.isNumber)
        return NUMBER_PLACEHOLDER;
    else if (type.isLocation)
        return LOCATION_PLACEHOLDER;
    else if (type.isDate)
        return DATE_PLACEHOLDER;
    else
        return null;
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

function mustAvoidDuplicates(value) {
    if (value.isLocation && value.value.isRelative)
        return false;
    if (value.isEnum || value.isBoolean)
        return false;
    if (value.isEntity && value.type === 'tt:device')
        return false;
    if (value.isEvent)
        return false;
    if (value.isUndefined || value.isVarRef)
        return false;
    return true;
}

function stringHash(value) {
    if (value.isEntity)
        return `entity-${value.type}:${value.value}`;
    if (value.isMeasure)
        return `measure-${value.unit}:${value.value}`;
    if (value.isString)
        return `string-"${value.value}"`;
    if (value.isNumber)
        return `num-${value.value}`;
    if (value.isLocation)
        return `loc-lat:${value.value.lat}-lon:${value.value.lon}`;
    if (value.isDate)
        return `date-${value.value.toISOString()}`;
    if (value.isTime)
        return `time-${value.hour}-${value.minute}`;
    throw new TypeError('Should not hash a value of the form ' + value);
}

function chooseValues(valueList, usedValues) {
    let filtered = [];
    for (let candidate of valueList) {
        if (mustAvoidDuplicates(candidate)) {
            let hash = stringHash(candidate);
            if (usedValues.has(hash)) {
                continue;
            }
            usedValues.add(hash);
            filtered.push(candidate);
            return filtered;
        } else {
            filtered.push(candidate);
        }
    }
    return filtered;
}

const gettext = new (require('node-gettext'));
gettext.setlocale('en-US');

function expandOne(example, argtypes, argrequired, into) {
    let argnames = extractArgNames(example);
    let assignments = {};
    let usedValues = new Set;

    return (function expandRecursively(expanded, i, forcePlaceholder) {
        if (i === argnames.length) {
            var copy = {};
            Object.assign(copy, assignments);
            return into.push({ utterance: expanded,
                               assignments: copy });
        }

        let argname = argnames[i];
        let argtype = argtypes[argname];
        if (!argtype)
            throw new TypeError('Invalid placeholder $' + argname);

        let type = argtype;
        if (argtype.isArray)
            type = argtype.elem;

        let choices = chooseValues(ThingTalk.Generate.genRandomValue(argname, type, true), usedValues);
        let placeholder = getPlaceholder(type);

        if (!choices)
            throw new TypeError('Cannot expand placeholder $' + argname + ' of type ' + argtype);

        var argnameRegex = '\\$' + argname;

        if (!forcePlaceholder) {
            choices.forEach(function(c) {
                assignments[argname] = c;
                let description = ThingTalk.Describe.describeArg(gettext, c, true);
                expandRecursively(expanded.replace(new RegExp(argnameRegex, 'g'), description), i+1, false);
                assignments[argname] = undefined;
            });
        }

        if (placeholder && argrequired[argname]) {
            // make one with lexical placeholders with no assignments
            // the goal is to have utterances like
            // "tweet something" in addition to "tweet abc def"
            // where the latter would be slot filled
            // the reason is that the NL is a lot happier with no
            // arguments
            expandRecursively(expanded.replace(new RegExp(argnameRegex, 'g'), placeholder), i+1, true);
        }
    })(example, 0, false);
}

module.exports = function expandExamples(examples, argtypes, argrequired) {
    var into = [];

    examples.forEach(function(ex) {
        expandOne(ex, argtypes, argrequired, into);
    });

    return into;
}
