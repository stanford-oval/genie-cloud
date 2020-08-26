// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Jim Deng
"use strict";

const Config = require('../config');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.add_parser('get-config', {
            description: 'Print a configuration value'
        });
        parser.add_argument('key', {
            help: 'The configuration key to print',
        });
    },

    main(argv) {
        if (Config[argv.key] === undefined) // null/false/0 are valid configuration values, so don't use !
            throw Error(`Invalid configuration key ${argv.key}`);
        console.log(Config[argv.key]);
    }
};
