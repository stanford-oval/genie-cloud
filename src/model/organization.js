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


import * as db from '../util/db';
import { InternalError } from '../util/errors';

export async function get(client, id) {
    return db.selectOne(client, "select * from organizations where id = ?",
                        [id]);
}
export async function getByIdHash(client, idHash) {
    return db.selectOne(client, "select * from organizations where id_hash = ?",
                        [idHash]);
}
export async function getCredits(client, id) {
    // lock in exclusive mode so we can check the credit count
    const row = await db.selectOne(client, "select credits from organizations where id = ? for update", [id]);
    return row.credits;
}
export async function applyWeeklyCreditUpdate(client, params) {
    const query = `update organizations org, org_statistics os set
        org.credits = org.credits + (
            ${params.WEEKLY_APPROVED_THINGPEDIA_UPDATE} * approved_device_count +
            ${params.WEEKLY_OSS_THINGPEDIA_UPDATE} * (oss_device_count - oss_approved_device_count) +
            ${params.WEEKLY_THINGPEDIA_UPDATE} * (device_count - approved_device_count - (oss_device_count - oss_approved_device_count)) +
            ${params.WEEKLY_OSS_TEMPLATE_PACK_UPDATE} * oss_template_file_count)
            * timestampdiff(week, last_credit_update, now()),
        org.last_credit_update = org.last_credit_update + interval (timestampdiff(week, last_credit_update, now())) week
        where org.id = os.id`;
        // ^ add an integer number of weeks
    console.log(query);
    await db.query(client, query);
}

export async function getAll(client, start, end) {
    if (start !== undefined && end !== undefined)
        return db.selectAll(client, "select * from organizations order by id limit ?,?", [start,end]);
    else
        return db.selectAll(client, "select * from organizations order by id");
}

export async function getByFuzzySearch(client, tag) {
    let pctag = '%' + tag + '%';
    return db.selectAll(client, `(select * from organizations where name like ? or comment like ?)
                        union distinct (select o.* from organizations o where exists (select 1 from users
                        where username = ? and developer_org = o.id))`,
                        [pctag, pctag, tag]);
}

export async function getMembers(client, id) {
    return db.selectAll(client, "select id,cloud_id,username,developer_status,profile_flags,roles from users where developer_org = ?", [id]);
}
export async function getInvitations(client, id) {
    return db.selectAll(client, `select id,cloud_id,username,-1 as developer_status,profile_flags,roles
        from users, org_invitations where id = user_id and org_id = ?`, [id]);
}
export async function getInvitationsOfUser(client, userId) {
    return db.selectAll(client, `select * from organizations, org_invitations where id = org_id and user_id = ?`, [userId]);
}
export async function findInvitation(client, orgId, userId) {
    return db.selectAll(client, `select * from org_invitations where user_id = ? and org_id = ?`, [userId, orgId]);
}
export async function inviteUser(client, orgId, userId, status) {
    return db.query(client, `insert into org_invitations set user_id = ?, org_id = ?, developer_status = ?`, [userId, orgId, status]);
}
export async function rescindInvitation(client, orgId, userId) {
    return db.query(client, `delete from org_invitations where user_id = ? and org_id = ?`, [userId, orgId]);
}
export async function rescindAllInvitations(client, userId) {
    return db.query(client, `delete from org_invitations where user_id = ?`, [userId]);
}

export async function getByDeveloperKey(client, key) {
    return db.selectAll(client, "select id,is_admin from organizations where developer_key = ?", [key]);
}

export async function create(client, org) {
    return db.insertOne(client, 'insert into organizations set ?', [org]).then((id) => {
        org.id = id;
        return org;
    });
}
export async function update(client, id, org) {
    return db.query(client, "update organizations set ? where id = ?", [org, id]);
}
async function _delete(client, id) {
    return db.query(client, "delete from organizations where id = ?", [id]);
}
export { _delete as delete };
export async function updateCredits(client, id, credits) {
    await db.query(client, `update organizations set credits = credits + (?) where id = ?`, [credits, id]);
    const row = await db.selectOne(client, `select credits from organizations where id = ?`, [id]);
    if (row.credits < 0)
        throw new InternalError('EOVERFLOW', `Credit count became negative`);
}

export async function getStatistics(client, id) {
    return db.selectOne(client, `select * from org_statistics where id = ?`, [id]);
}
