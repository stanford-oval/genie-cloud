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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

// This file must be imported by all processes before any other module is required

// this module will modify the exported values in config.js so we need to use the
// low-level CommonJS interface
/* eslint @typescript-eslint/no-var-requires: off */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

// base config
const Config = require('../config');

// load configuration overrides for non-secret data
try {
    Object.assign(Config, require('../../custom_config'));
} catch(e) {
    if (e.code !== 'MODULE_NOT_FOUND')
        throw e;
    // ignore if there is no file
}

// legacy configuration override
try {
    Object.assign(Config, require('../../secret_config'));
} catch(e) {
    if (e.code !== 'MODULE_NOT_FOUND')
        throw e;
    // ignore if there is no file
}

function assign(cfg) {
    for (let name in cfg) {
        if (!(name in Config)) {
            console.error(`WARNING: Unknown configuration key ${name}`);
            continue;
        }
        Config[name] = cfg[name];
    }
}
function tryLoad(pathname) {
    try {
        if (pathname.endsWith('.json'))
            assign(JSON.parse(fs.readFileSync(pathname, 'utf8')));
        else if (pathname.endsWith('.yaml') || pathname.endsWith('.yml'))
            assign(yaml.load(fs.readFileSync(pathname, 'utf8')));
        else if (pathname.endsWith('.js'))
            assign(require(pathname));
        else
            console.error(`WARNING: Ignored configuration file ${pathname}: unknown file extension`);
    } catch(e) {
        if (e.code !== 'EPERM' && e.code !== 'EACCESS' && e.name !== 'SyntaxError')
            throw e;
        console.error(`WARNING: Ignored configuration file ${pathname}: ${e.message}`);
    }
}

// the new configuration path
try {
    const configdir = process.env.THINGENGINE_CONFIGDIR || '/etc/almond-cloud';

    for (let filename of ['config.js', 'config.json', 'config.yaml', 'config.yml']) {
        const pathname = path.resolve(configdir, filename);
        if (fs.existsSync(pathname)) {
            tryLoad(pathname);
            break;
        }
    }
    const dirpath = path.resolve(configdir, 'config.d');
    for (let filename of fs.readdirSync(dirpath).sort()) {
        const pathname = path.resolve(dirpath, filename);
        tryLoad(pathname);
    }
} catch(e) {
    if (e.code !== 'ENOENT')
        throw e;
    // ignore if the directory/file does not exist
}

if (Config.WITH_THINGPEDIA !== 'embedded' && Config.WITH_THINGPEDIA !== 'external')
    throw new Error('Invalid configuration, WITH_THINGPEDIA must be either embedded or external');
if (Config.WITH_THINGPEDIA === 'embedded') // ignore whatever setting is there
    Config.THINGPEDIA_URL = '/thingpedia';
if (Config.WITH_LUINET !== 'embedded' && Config.WITH_LUINET !== 'external')
    throw new Error('Invalid configuration, WITH_LUINET must be either embedded or external');
