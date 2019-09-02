#!/usr/bin/env node
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

require('../util/config_init');

const name = process.argv[2];
const Config = require('../config');

if (Config[name] === undefined) // null/false/0 are valid configuration values, so don't use !
    throw Error(`Invalid configuration key ${name}`);
console.log(Config[name]);
