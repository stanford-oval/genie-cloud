// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const mysql = require('mysql');
const Q = require('q');
const Prometheus = require('prom-client');

const { NotFoundError, InternalError } = require('../util/errors');

const Config = require('../config');

function getDBCommand(query) {
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
    var url = Config.DATABASE_URL;
    if (url === undefined)
        return "mysql://thingengine:thingengine@localhost/thingengine?charset=utf8mb4_bin";
    else
        return url;
}

function monitoredQuery(client, string, args) {
    const queryStartTime = new Date;
    const dbCommand = getDBCommand(string);
    const labels = { command: dbCommand, query: string };
    dbQueryTotal.inc(labels);

    return Q.ninvoke(client, 'query', string, args).then((result) => {
        dbQueryDuration.observe(labels, Date.now() - queryStartTime.getTime());
        return result;
    }, (err) => {
        dbQueryDuration.observe(labels, Date.now() - queryStartTime.getTime());
        dbFailuresTotal.inc({ command: dbCommand, query: string, sqlState: err.sqlState });
        throw err;
    });
}

function query(client, string, args) {
    if (Config.ENABLE_PROMETHEUS && !/^(commit$|rollback$|start transaction |set transaction |)/i.test(string))
        return monitoredQuery(client, string, args);
    else
        return Q.ninvoke(client, 'query', string, args);
}

function rollback(client, err, done) {
    dbRollbackTotal.inc();
    return query(client, 'rollback').then(() => {
        done();
    }, (rollerr) => {
        done(rollerr);
    });
}


function selectAll(client, string, args) {
    return query(client, string, args).then(([rows, fields]) => rows);
}

function selectOne(client, string, args) {
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

let _pool;
function getPool() {
    if (_pool === undefined)
        _pool = mysql.createPool(getDB());
    return _pool;
}

function connect() {
    return Q.ninvoke(getPool(), 'getConnection').then((connection) => {
        function done(error) {
            if (error !== undefined)
                connection.destroy();
            else
                connection.release();
        }
        return [connection, done];
    });
}

module.exports = {
    getPool,
    connect,
    tearDown() {
        if (_pool === undefined)
            return Promise.resolve();
        const pool = _pool;
        _pool = undefined;
        return new Promise((resolve, reject) => {
            pool.end((err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    },

    withClient(callback) {
        return connect().then(async ([client, done]) => {
            return Promise.resolve(callback(client)).then((result) => {
                done();
                return result;
            }, (err) => {
                done();
                throw err;
            });
        });
    },

    withTransaction(transaction, isolationLevel = 'serializable', readOnly = 'read write') {
        // NOTE: some part of the code still rely on db.withClient
        // and db.withTransaction returning a Q.Promise rather than
        // a native Promise (eg they use .done() or .finally())
        // hence, you must not convert this function to async (as
        // that always returns a native Promise)
        // using async for callbacks is fine, as long as the first
        // returned promise is Q.Promise

        dbTransactionTotal.inc();
        return connect().then(async ([client, done]) => {
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
            } catch (error) {
                done(error);
                throw error;
            }
        });
    },

    insertOne(client, string, args) {
        return query(client, string, args).then(([result, fields]) => {
            if (result.insertId === undefined)
                throw new InternalError('E_NO_ID', "Row does not have ID");

            return result.insertId;
        });
    },

    insertIgnore(client, string, args) {
        return query(client, string, args).then(([result, fields]) => {
            return result.affectedRows > 0;
        });
    },

    selectOne,
    selectAll,
    query
};
