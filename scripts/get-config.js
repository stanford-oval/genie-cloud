// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Jim Deng
//
// See COPYING for details
"use strict";

const Config = require('../config');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('get-config', {
            description: 'Print a configuration value'
        });
        parser.addArgument(['key'], {
            help: 'The configuration key to print',
        });
    },

    main(argv) {
        if (Config[argv.key] === undefined) // null/false/0 are valid configuration values, so don't use !
            throw Error(`Invalid configuration key ${argv.key}`);
        console.log(Config[argv.key]);
    }
};
