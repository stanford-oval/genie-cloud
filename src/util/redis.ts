// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Neil Souza <neil@neilsouza.com>

import { createClient } from "redis";
import { RedisClientType } from "redis/dist/lib/client";

import * as Config from "../config";

let clientPromise : null | Promise<RedisClientType> = null;

function hasRedis() : boolean {
    return (
        typeof Config.REDIS_HOST === "string" && Config.REDIS_HOST.length > 0
    );
}

function getURL() : string {
    let url = "redis://";
    if (Config.REDIS_USER !== null) {
        url += Config.REDIS_USER;
        if (Config.REDIS_PASSWORD !== null) 
            url += `:${Config.REDIS_PASSWORD}`;
        url += "@";
    }
    url += Config.REDIS_HOST;
    return url;
}

async function createNewClient() : Promise<RedisClientType> {
    console.log(`ENTER redis.createNewClient()`);
    
    const url = getURL();
    
    console.log(`Creating new Redis client...`);
    const client = createClient({ url });
    
    await client.connect();

    console.log(`Returning new Redis client.`);
    return client;
}

function getRedisClient() : Promise<RedisClientType> {
    console.log(`ENTER redis.getClient()`);
    if (clientPromise === null) 
        clientPromise = createNewClient();
    return clientPromise;
}

export { hasRedis, getRedisClient };
