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
        return db.selectOne(client, "select oc.*, org.name as owner_name from oauth2_clients oc, organizations org where oc.id = ? and org.id = oc.owner", [id]);
    },

    getClients(client, id) {
        return db.selectAll(client, "select oc.*, org.name as owner_name from oauth2_clients oc, organizations org where oc.id = ? and org.id = oc.owner", [id]);
    },

    getClientsByOwner(client, owner) {
        return db.selectAll(client, "select * from oauth2_clients where owner = ?", [owner]);
    },

    createClient(dbClient, client) {
        return db.insertOne(dbClient, 'insert into oauth2_clients set ?', [client]).then(() => client);
    },

    getPermission(dbClient, clientId, userId) {
        return db.selectOne(dbClient, 'select * from oauth2_permissions where client_id = ? and user_id = ?', [clientId, userId]);
    },
    createPermission(dbClient, clientId, userId, scope) {
        return db.insertOne(dbClient, 'insert or replace into oauth2_permissions(client_id, user_id, scope) values(?,?,?)', [clientId, userId, scope]);
    },
    revokePermission(dbClient, clientId, userId) {
        return db.query(dbClient,'delete from oauth2_permissions where client_id = ? and user_id = ?', [clientId, userId]);
    },
    revokeAllPermissions(dbClient, clientId) {
        return db.query(dbClient,'delete from oauth2_permissions where client_id = ?', [clientId]);
    },

    getAllPermissionsOfUser(dbClient, userId) {
        return db.selectAll(dbClient, "select oc.* from oauth2_clients oc, oauth2_permissions op where oc.id = op.client_id and op.user_id = ?", [userId]);
    }
};
