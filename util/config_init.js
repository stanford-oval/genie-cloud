// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// This file must be imported by all processes before any other module is required

// base config
const Config = require('../config');

// load configuration overrides for non-secret data
try {
    Object.assign(Config, require('../custom_config.js'));
} catch(e) {
    if (e.code !== 'MODULE_NOT_FOUND')
        throw e;
    // ignore if there is no file
}

// load configuration overrides for secret data
try {
    Object.assign(Config, require('/etc/almond-cloud/config.js'));
} catch(e) {
    if (e.code !== 'MODULE_NOT_FOUND')
        throw e;
    // ignore if there is no file
}

// legacy configuration override
try {
    Object.assign(Config, require('../secret_config.js'));
} catch(e) {
    if (e.code !== 'MODULE_NOT_FOUND')
        throw e;
    // ignore if there is no file
}
