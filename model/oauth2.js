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

    createClient(dbClient, client) {
        return db.insertOne(dbClient, 'insert into oauth2_clients set ?', [client]).then(() => client);
    },
    createRefreshToken(dbClient, token) {
        return db.insertOne(dbClient, 'replace into oauth2_refresh_tokens set ?', [token]).then(() => token);
    },
    getRefreshToken(dbClient, token) {
        return db.selectOne(dbClient, 'select * from oauth2_refresh_tokens where token = ?', [token]);
    }
};
