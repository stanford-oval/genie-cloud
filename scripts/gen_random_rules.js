// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const genRandomRules = require('../util/gen_random_rule');

function main() {
    genRandomRules(process.argv[2] || 'uniform', process.argv[3] || 'en', process.argv[4] || 10).then((rules) => {
        for (var rule of rules)
            console.log(JSON.stringify(rule));
    }).then(() => { process.exit(); }).done();
}

main();
