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

const db = require('../util/db');

module.exports = {
    getClient(client, id) {
        return db.selectOne(client, "select * from oauth2_clients where id = ?", [id]);
    },

    getClients(client, id) {
        return db.selectAll(client, "select * from oauth2_clients where id = ?", [id]);
    },

    getClientsByOwner(client, owner) {
        return db.selectAll(client, "select * from oauth2_clients where owner = ?", [owner]);
    },

    getCodes(client, oauth2ClientId, code) {
        return db.selectAll(client, "select * from oauth2_auth_codes where client_id = ? and code = ?",
                            [oauth2ClientId, code]);
    },

    deleteCode(client, oauth2ClientId, userId) {
        return db.query(client, "delete from oauth2_auth_codes where client_id = ? and user_id = ?",
                        [oauth2ClientId, userId]);
    },

    createClient(dbClient, client) {
        return db.insertOne(dbClient, 'insert into oauth2_clients set ?', [client]).then(() => client);
    },
    createCode(dbClient, code) {
        return db.insertOne(dbClient, 'replace into oauth2_auth_codes set ?', [code]).then(() => code);
    },
    createToken(dbClient, token) {
        return db.insertOne(dbClient, 'replace into oauth2_access_tokens set ?', [token]).then(() => token);
    },
};
