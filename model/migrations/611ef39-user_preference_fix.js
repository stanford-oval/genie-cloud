#!/usr/bin/env node
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

process.on('unhandledRejection', (up) => { throw up; });
import '../../src/util/config_init';

import * as db from '../../src/util/db';

async function main() {
    await db.withTransaction(async (dbClient) => {
        const rows = await db.selectAll(dbClient, `select * from user_preference`);

        await db.query(dbClient, `delete from user_preference`);

        const toInsert = [];

        for (const row of rows) {
            if (!row.value.startsWith('{'))
                continue;

            const value = JSON.parse(row.value);

            for (const key in value) {
                if (key === 'sqlite-schema-version')
                    continue;
                toInsert.push([row.userId, key, JSON.stringify(value[key])]);
            }
        }

        await db.query(dbClient, `insert into user_preference(userId,uniqueId,value) values ?`, [toInsert]);
    });
    await db.tearDown();
}
main();
