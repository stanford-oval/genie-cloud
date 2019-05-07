#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019  The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('../util/config_init');

const db = require('../util/db');
const userToShardId = require('../almond/shard');

const Config = require('../config');

async function main() {
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
main();
