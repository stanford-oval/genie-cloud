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

const gettext = new (require('node-gettext'));
gettext.setlocale('en-US');

function testOne(base, argtypes, argrequired) {
    var expanded = expandExamples(gettext, [base], argtypes, argrequired||{});
    expanded.forEach(function(exp) {
        console.log();
        console.log(exp.utterance);
        for (var name in exp.assignments)
            console.log(name, String(exp.assignments[name]));
    });
}

function main() {
    testOne('post on twitter saying $text', { text: Type.String }, { text: true });
    testOne('set temperature to $temp', { temp: Type.Measure('C') }, { temp: true });
    testOne('monitor tweets coming from $from containing $string', { from: Type.Entity('tt:username'), string: Type.String });
    testOne('turn $power coffee pot', { power: Type.Boolean }, { power: true });
    testOne('how far is uber from $location', { location: Type.Location });
    testOne('how much is uber from $src_location to $dest_location', { dest_location: Type.Location, src_location: Type.Location });
    testOne('set my phone to $mode', { mode: Type.Enum(['vibrate', 'silent', 'normal']) });
    testOne('send sms to $to', { to: Type.Entity('tt:phone_number') });
    testOne('send email to $to', { to: Type.Entity('tt:email_address') });

    // add a test with no spaces (for chinese)
    testOne('sendemailto$to', { to: Type.Entity('tt:email_address') });
    testOne('sendemailto$to saying$message', { to: Type.Entity('tt:email_address'), message: Type.String });

    // add a test with the same argument twice
    testOne('frob$foo to$foo', { foo: Type.Number });

    // enums
    testOne('bla $foo', { foo: Type.Enum(['aaa_bbb', 'ccc']) });
}

main();
