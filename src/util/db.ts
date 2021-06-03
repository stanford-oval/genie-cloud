// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as mysql from 'mysql';
import * as util from 'util';
import Prometheus from 'prom-client';

import { NotFoundError, InternalError } from './errors';

import * as Config from '../config';

export type Client = mysql.Connection;

/**
 * Utility type to construct a row interface where optional values can be omitted.
 */
export type Optional<T, Opt extends keyof T> = Omit<T, Opt> & { [K in Opt] ?: T[K] };

/**
 * Utility type to construct a row interface that does not need the ID.
 */
export type WithoutID<T extends { id ?: unknown }> = Optional<T, 'id'>;

/**
 * Utility type to construct a row interface that guarantees the ID is specified.
 */
 export type WithID<T extends { id ?: unknown }> = T & { id : Exclude<T['id'], null|undefined> };

function getDBCommand(query : string) {
    const match = /^\s*\(\*([a-z]+)\s/i.exec(query);
    if (match === null)
        return 'unknown';
    else
        return match[1].toLowerCase();
}

const dbQueryTotal = new Prometheus.Counter({
    name: 'db_queries_total',
    help: 'Count the number of DB queries (grouped by db command (select, insert, update, etc.), unfilled db query)',
    labelNames: ['command', 'query'],
});
const dbFailuresTotal = new Prometheus.Counter({
    name: 'db_query_error_total',
    help: 'Count the number of DB errors (grouped by db command (select, insert, update, etc.), unfilled db query)',
    labelNames: ['command', 'query', 'sqlState'],
});

const dbQueryDuration = new Prometheus.Histogram({
    name: 'db_query_duration_ms',
    help: 'Log db query duration (grouped by db command (select, insert, update, etc.), unfilled db query)',
    labelNames: ['command', 'query'],
    buckets: [0.10, 5, 15, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000] // buckets for query duration time from 0.1ms to 5s
});
const dbTransactionTotal = new Prometheus.Counter({
    name: 'db_transactions_total',
    help: 'Count the number of DB transactions',
    labelNames: [],
});
const dbRollbackTotal = new Prometheus.Counter({
    name: 'db_transaction_rollback_total',
    help: 'Count the number of DB rollbacks',
    labelNames: [],
});

function getDB() {
    const url = Config.DATABASE_URL;
    if (url === undefined)
        return "mysql://thingengine:thingengine@localhost/thingengine?charset=utf8mb4_bin";
    else
        return url;
}

function doQuery(client : mysql.Connection, string : string, args ?: unknown[]) : Promise<[any, mysql.FieldInfo[]|undefined]> {
    return new Promise((resolve, reject) => {
        client.query(string, args, (err, result, fields) => {
            if (err)
                reject(err);
            else
                resolve([result, fields]);
        });
    });
}

function monitoredQuery(client : mysql.Connection, string : string, args ?: unknown[]) {
    const queryStartTime = new Date;
    const dbCommand = getDBCommand(string);
    const labels = { command: dbCommand, query: string };
    dbQueryTotal.inc(labels);

    return doQuery(client, string, args).then((result) => {
        dbQueryDuration.observe(labels, Date.now() - queryStartTime.getTime());
        return result;
    }, (err) => {
        dbQueryDuration.observe(labels, Date.now() - queryStartTime.getTime());
        dbFailuresTotal.inc({ command: dbCommand, query: string, sqlState: err.sqlState });
        throw err;
    });
}

export function query(client : mysql.Connection, string : string, args ?: unknown[]) {
    if (Config.ENABLE_PROMETHEUS && !/^(commit$|rollback$|start transaction |set transaction |)/i.test(string))
        return monitoredQuery(client, string, args);
    else
        return doQuery(client, string, args);
}

function rollback(client : mysql.Connection, err : Error, done : (err ?: Error) => void) {
    dbRollbackTotal.inc();
    return query(client, 'rollback').then(() => {
        done();
    }, (rollerr) => {
        done(rollerr);
    });
}


export function selectAll(client : mysql.Connection, string : string, args ?: unknown[]) : Promise<any[]> {
    return query(client, string, args).then(([rows, fields]) => rows);
}

export function selectOne(client : mysql.Connection, string : string, args ?: unknown[]) {
    return selectAll(client, string, args).then((rows) => {
        if (rows.length !== 1) {
            if (rows.length === 0)
                throw new NotFoundError();
            else
                throw new InternalError('E_TOO_MANY_ROWS', "Wrong number of rows returned, expected 1, got " + rows.length);
        }

        return rows[0];
    });
}

let _pool : mysql.Pool|undefined;
export function getPool() : mysql.Pool {
    if (_pool === undefined)
        _pool = mysql.createPool(getDB());
    return _pool;
}

export function connect() : Promise<[mysql.Connection, (err ?: Error) => void]> {
    const pool = getPool();
    return util.promisify(pool.getConnection).call(pool).then((connection) => {
        function done(error ?: Error) {
            if (error !== undefined)
                connection.destroy();
            else
                connection.release();
        }
        return [connection, done];
    });
}

export function tearDown() {
    if (_pool === undefined)
        return Promise.resolve();
    const pool = _pool;
    _pool = undefined;
    return new Promise<void>((resolve, reject) => {
        pool.end((err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}

export function withClient<T>(callback : (client : mysql.Connection) => Promise<T>) : Promise<T> {
    return connect().then(async ([client, done]) => {
        return Promise.resolve(callback(client)).then((result) => {
            done();
            return result;
        }, (err) => {
            done();
            throw err;
        });
    });
}

export async function withTransaction<T>(transaction : (client : mysql.Connection) => Promise<T>, isolationLevel = 'serializable', readOnly = 'read write') : Promise<T> {
    dbTransactionTotal.inc();
    const [client, done] = await connect();
    // danger! we're pasting strings into SQL
    // this is ok because the argument NEVER comes from user input
    try {
        await query(client, `set transaction isolation level ${isolationLevel}`);
        await query(client, `start transaction ${readOnly}`);
        try {
            const result = await transaction(client);
            await query(client, 'commit');
            done();
            return result;
        } catch(err) {
            await rollback(client, err, done);
            throw err;
        }
    } catch(error) {
        done(error);
        throw error;
    }
}

export async function insertOne(client : mysql.Connection, string : string, args ?: unknown[]) : Promise<any> {
    const [result,] = await query(client, string, args);
    if (result.insertId === undefined)
        throw new InternalError('E_NO_ID', "Row does not have ID");

    return result.insertId;
}

export function insertIgnore(client : mysql.Connection, string : string, args ?: unknown[]) : Promise<boolean> {
    return query(client, string, args).then(([result, fields]) => {
        return result.affectedRows > 0;
    });
}
