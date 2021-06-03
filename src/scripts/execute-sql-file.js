// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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


const execSql = require('../util/exec_sql');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.add_parser('execute-sql-file', {
            description: 'Execute a SQL script against the configured Almond Cloud database'
        });
        parser.add_argument('filename', {
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
