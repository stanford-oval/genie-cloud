// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function createOAuth2Code(client, code) {
    var KEYS = ['user_id', 'client_id', 'code', 'redirectURI',];
    KEYS.forEach(function(key) {
        if (code[key] === undefined)
            code[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return code[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into oauth2_auth_codes(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then(function(id) {
                            return code;
                        });
}

function createOAuth2Token(client, token) {
    var KEYS = ['user_id', 'client_id', 'token'];
    KEYS.forEach(function(key) {
        if (token[key] === undefined)
            token[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return token[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into oauth2_access_tokens(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then(function(id) {
                            return token;
                        });
}

module.exports = {
    getClient: function(client, id) {
        return db.selectOne(client, "select * from oauth2_clients where id = ?", [id]);
    },

    getClients: function(client, id) {
        return db.selectAll(client, "select * from oauth2_clients where id = ?", [id]);
    },

    getCodes: function(client, oauth2ClientId, code) {
        return db.selectAll(client, "select * from oauth2_auth_codes where client_id = ? and code = ?",
                            [oauth2ClientId, code]);
    },

    deleteCode: function(client, oauth2ClientId, userId) {
        return db.query(client, "delete from oauth2_auth_codes where client_id = ? and user_id = ?",
                        [oauth2ClientId, userId]);
    },

    createCode: createOAuth2Code,
    createToken: createOAuth2Token,
}
