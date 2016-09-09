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
    testOne('how far is uber from $location', { location: Type.Location });
    testOne('how much is uber from $src_location to $dest_location', { src_location: Type.Location, dest_location: Type.Location });
    testOne('set my phone to $mode', { mode: Type.Enum(['vibrate', 'silent', 'normal']) });
    testOne('send sms to $to', { to: Type.PhoneNumber });
    testOne('send email to $to', { to: Type.EmailAddress });

    // add a test with no spaces (for chinese)
    testOne('sendemailto$to', { to: Type.EmailAddress });
    testOne('sendemailto$tosaying$message', { to: Type.EmailAddress, message: Type.String });

    // add a test with the same argument twice
    testOne('frob$footo$foo', { foo: Type.Number });
}

main();
