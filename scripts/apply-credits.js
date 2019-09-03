// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

const orgModel = require('../model/organization');
const creditSystem = require('../util/credit_system');
const db = require('../util/db');

module.exports = {
    initArgparse(subparsers) {
        subparsers.addParser('apply-credits', {
            description: 'Apply weekly credit update'
        });
    },

    async main(argv) {
        await db.withTransaction((dbClient) => {
            return orgModel.applyWeeklyCreditUpdate(dbClient, creditSystem);
        });

        await db.tearDown();
    }
};
