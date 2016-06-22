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

const expandExamples = require('../util/expand_examples');

function testOne(base, argtypes) {
    var expanded = expandExamples([base], argtypes);
    expanded.forEach(function(exp) {
        console.log(exp.utterance, exp.assignments);
    });
}

function main() {
    testOne('post on twitter saying $text', { text: Type.String });
    testOne('set temperature to $temp', { temp: Type.Measure('C') });
    testOne('monitor tweets coming from $from containing $string', { from: Type.String, string: Type.String });
    testOne('turn $power coffee pot', { power: Type.Boolean });
}

main();
