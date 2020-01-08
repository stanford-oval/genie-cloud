// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const execSql = require('../util/exec_sql');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('execute-sql-file', {
            description: 'Execute a SQL script against the configured Almond Cloud database'
        });
        parser.addArgument('filename', {
            help: "The file to execute"
        });
    },

    async main(argv) {
        try {
            execSql.exec(argv.filename);
        } catch(e) {
            console.error(e);
            process.exit(1);
        }
    }
};
