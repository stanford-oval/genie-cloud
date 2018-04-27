// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const mysql = require('mysql');
const Q = require('q');

function getDB() {
    var url = process.env.DATABASE_URL;
    if (url === undefined)
        return "mysql://thingengine:thingengine@localhost/thingengine?charset=utf8mb4_bin";
    else
        return url;
}

function query(client, string, args) {
    return Q.ninvoke(client, 'query', string, args);
}

function rollback(client, err, done) {
    return query(client, 'rollback').then(() => {
        done();
        throw err;
    }, (rollerr) => {
        done(rollerr);
        throw err;
    });
}

function commit(client, result, done) {
    return query(client, 'commit').then(() => {
        done();
        return result;
    });
}

function selectAll(client, string, args) {
    return query(client, string, args).then(([rows, fields]) => rows);
}

function selectOne(client, string, args) {
    return selectAll(client, string, args).then((rows) => {
        if (rows.length !== 1)
            throw new Error("Wrong number of rows returned, expected 1, got " + rows.length);

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

    withClient(callback) {
        return connect().then(([client, done]) => {
            return callback(client).then((result) => {
                done();
                return result;
            }, (err) => {
                done();
                throw err;
            });
        });
    },

    withTransaction(transaction) {
        return connect().then(([client, done]) => {
            return query(client, 'start transaction').then(() => {
                return transaction(client).then((result) => {
                    return commit(client, result, done);
                }).catch((err) => {
                    return rollback(client, err, done);
                });
            }, (error) => {
                done(error);
                throw error;
            });
        });
    },

    insertOne(client, string, args) {
        return query(client, string, args).then(([result, fields]) => {
            if (result.insertId === undefined)
                throw new Error("Row does not have ID");

            return result.insertId;
        });
    },

    selectOne,
    selectAll,
    query
};
