// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Tp = require('thingpedia');
const seedrandom = require('seedrandom');

// FIXME: we cannot require "genie-toolkit" because that will try and load mmap-io
// which is incompatible with worker use
const { ContextualSentenceGenerator } = require('genie-toolkit/lib/sentence-generator');

module.exports = function worker(args, shard) {
    const tpClient = new Tp.FileClient(args);
    const options = {
        rng: seedrandom.alea(args.random_seed + ':' + shard),
        idPrefix: shard + ':',
        locale: args.locale,
        flags: args.flags || {},
        templateFile: args.template,
        thingpediaClient: tpClient,
        maxDepth: args.maxdepth,
        targetPruningSize: args.targetPruningSize,
        debug: args.debug,
    };
    return new ContextualSentenceGenerator(options);
};
