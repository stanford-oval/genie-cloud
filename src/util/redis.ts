import { createClient } from "redis";
import { RedisClientType } from "redis/dist/lib/client";

import * as Config from "../config";

enum State {
    Closed,
    Connecting,
    Ready,
}

let currentClient : null | RedisClientType = null;
let state : State = State.Closed;

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

function ensureClient() : RedisClientType {
    console.log(`ENTER redis.ensureClient()`);
    const existingClient = currentClient;
    if (existingClient !== null) {
        console.log(`Client exists, returning.`);
        return existingClient;
    }
    
    const url = getURL();
    console.log(`Creating new Redis client for ${url}...`);
    const newClient = createClient({ url });

    newClient.connect().then(
        () => {
            console.log(
                `Redis client connected, setting redis.state to Ready.`
            );
            state = State.Ready;
        },
        (reason) => {
            console.error(`Redis client failed to connect: ${reason}`);
            currentClient = null;
            console.log(`Setting redis.state to Closed.`);
            state = State.Closed;
        }
    );

    currentClient = newClient;

    console.log(`Returning new client.`);
    return newClient;
}

async function getRedisClient() : Promise<RedisClientType> {
    console.log(`ENTER redis.getClient()`);
    const client = ensureClient();
    if (state === State.Connecting) {
        console.log(`Redis client is Connecting, returning promise.`);
        return new Promise<RedisClientType>((resolve, reject) => {
            const readyListener = () => {
                console.log(`Redis emitted "ready", resolving client.`);
                client.off("error", errorListener);
                resolve(client);
            };
            const errorListener = (error : Error) => {
                console.log(`Redis emitted "error", rejecting.`);
                client.off("ready", readyListener);
                reject(error);
            };
            client.on("ready", readyListener);
            client.on("error", errorListener);
        });
    }
    return client;
}

export { hasRedis, getRedisClient };
