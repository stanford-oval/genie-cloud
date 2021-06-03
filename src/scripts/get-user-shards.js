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


const db = require('../util/db');
const userToShardId = require('../almond/shard');

const Config = require('../config');

module.exports = {
    initArgparse(subparsers) {
        subparsers.add_parser('get-user-shards', {
            description: 'Print the shard assigned to each user'
        });
    },

    async main() {
        const shards = new Array(Config.THINGENGINE_MANAGER_ADDRESS.length);
        for (let i = 0; i < shards.length; i++)
            shards[i] = [];

        await db.withClient((dbClient) => {
            return new Promise((resolve, reject) => {
                const stream = dbClient.query(`select id,cloud_id from users`);
                stream.on('error', reject);
                stream.on('end', resolve);
                stream.on('result', (row) => {
                    shards[userToShardId(row.id)].push(row.cloud_id);
                });
            });
        });

        for (let i = 0; i < shards.length; i++) {
            if (i > 0)
                console.log();
            console.log(`${i}:`);
            for (let cloudId of shards[i])
                console.log(cloudId);
        }

        await db.tearDown();
    }
};
