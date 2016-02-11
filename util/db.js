// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

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
    return query(client, 'rollback').then(function() {
        done();
        throw err;
    }, function(rollerr) {
        done(rollerr);
        throw err;
    });
}

function commit(client, result, done) {
    return query(client, 'commit').then(function() {
        done();
        return result;
    });
}

function selectAll(client, string, args) {
    return query(client, string, args).then(function(result) {
        var rows = result[0];
        var fields = result[1];
        return rows;
    });
}

function selectOne(client, string, args) {
    return selectAll(client, string, args).then(function(rows) {
        if (rows.length != 1)
            throw new Error("Wrong number of rows returned, expected 1, got " + rows.length);

        return rows[0];
    });
}

var _pool;
function connect() {
    if (_pool === undefined) {
        _pool = mysql.createPool(getDB());
    }

    return Q.ninvoke(_pool, 'getConnection').then(function(connection) {
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
    connect: connect,

    withClient: function(callback) {
        return connect().then(function(result) {
            var client = result[0];
            var done = result[1];

            return callback(client).then(function(result) {
                done();
                return result;
            }, function(err) {
                done();
                throw err;
            });
        });
    },

    withTransaction: function(transaction) {
        return connect().then(function(connectResult) {
            var client = connectResult[0];
            var done = connectResult[1];

            return query(client, 'start transaction').then(function() {
                return transaction(client).then(function(result) {
                    return commit(client, result, done);
                }).catch(function(err) {
                    return rollback(client, err, done);
                });
            }, function(error) {
                done(error);
                throw error;
            });
        });
    },

    insertOne: function(client, string, args) {
        return query(client, string, args).spread(function(result, fields) {
            if (result.insertId === undefined)
                throw new Error("Row does not have ID");

            return result.insertId;
        });
    },

    selectOne: selectOne,
    selectAll: selectAll,

    query: query
};
