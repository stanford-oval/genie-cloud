// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2018 The Board of Trustees of the Leland Stanford Junior University
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


import * as db from '../util/db';

export async function getClient(client, id) {
    return db.selectOne(client, "select oc.*, org.name as owner_name from oauth2_clients oc, organizations org where oc.id = ? and org.id = oc.owner", [id]);
}

export async function getClients(client, id) {
    return db.selectAll(client, "select oc.*, org.name as owner_name from oauth2_clients oc, organizations org where oc.id = ? and org.id = oc.owner", [id]);
}

export async function getClientsByOwner(client, owner) {
    return db.selectAll(client, "select * from oauth2_clients where owner = ?", [owner]);
}

export async function createClient(dbClient, client) {
    return db.insertOne(dbClient, 'insert into oauth2_clients set ?', [client]).then(() => client);
}

export async function getPermission(dbClient, clientId, userId) {
    return db.selectOne(dbClient, 'select * from oauth2_permissions where client_id = ? and user_id = ?', [clientId, userId]);
}
export async function createPermission(dbClient, clientId, userId, scope) {
    return db.insertOne(dbClient, 'replace into oauth2_permissions(client_id, user_id, scope) values(?,?,?)', [clientId, userId, scope]);
}
export async function revokePermission(dbClient, clientId, userId) {
    return db.query(dbClient,'delete from oauth2_permissions where client_id = ? and user_id = ?', [clientId, userId]);
}
export async function revokeAllPermissions(dbClient, clientId) {
    return db.query(dbClient,'delete from oauth2_permissions where client_id = ?', [clientId]);
}

export async function getAllPermissionsOfUser(dbClient, userId) {
    return db.selectAll(dbClient, `select oc.*, org.name as owner_name from oauth2_clients oc,
        oauth2_permissions op, organizations org where oc.id = op.client_id and op.user_id = ?
        and org.id = oc.owner`, [userId]);
}
