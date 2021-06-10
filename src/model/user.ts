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

import assert from 'assert';

import * as db from '../util/db';

import * as Config from '../config';
const nshards = Config.THINGENGINE_MANAGER_ADDRESS.length;

export interface Row {
    id : number;
    username : string;
    human_name : string|null;
    email : string;
    email_verified : boolean;
    phone : string|null;
    locale : string;
    timezone : string;
    model_tag : string|null;
    google_id : string|null;
    github_id : string|null;
    facebook_id : string|null;
    omlet_id : string|null;
    password : string|null;
    salt : string|null;
    totp_key : string|null;
    cloud_id : string;
    auth_token : string;
    storage_key : string;
    roles : number;
    profile_flags : number;
    assistant_feed_id : string|null;
    developer_status : number;
    developer_org : number|null;
    force_separate_process : number;
    registration_time : Date;
    lastlog_time : Date;
}
export type OptionalFields = 'human_name' | 'email_verified' | 'phone' | 'locale' | 'timezone' |
    'model_tag' | 'google_id' | 'github_id' | 'facebook_id' | 'omlet_id' | 'password' |
    'salt' | 'totp_key' | 'roles' | 'profile_flags' | 'assistant_feed_id' | 'developer_status' |
    'developer_org' | 'force_separate_process' | 'registration_time' | 'lastlog_time';

export interface RowWithOrg extends Row {
    developer_key : string|null;
    developer_org_name : string|null;
}

export async function create<T extends db.Optional<Row, OptionalFields>>(client : db.Client, user : db.WithoutID<T>) : Promise<db.WithID<T>> {
    return db.insertOne(client, `insert into users set ?`, [user]).then((id) => {
        user.id = id;
        return user as db.WithID<T>;
    });
}

export async function get(client : db.Client, id : number) : Promise<RowWithOrg> {
    return db.selectOne(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                        + " on u.developer_org = o.id where u.id = ?", [id]);
}

export async function getSearch(client : db.Client, search : string) : Promise<RowWithOrg[]> {
    search = '%' + search + '%';
    return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                        + " on u.developer_org = o.id where username like ? or human_name like ? or email like ?",
                        [search, search, search]);
}

export async function getByName(client : db.Client, username : string) : Promise<RowWithOrg[]> {
    return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                        + " on u.developer_org = o.id where username = ?", [username]);
}

export async function getByEmail(client : db.Client, email : string) : Promise<RowWithOrg[]> {
    return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                        + " on u.developer_org = o.id where email = ?", [email]);
}

export async function getByGoogleAccount(client : db.Client, googleId : string) : Promise<RowWithOrg[]> {
    return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                        + " on u.developer_org = o.id where google_id = ?", [googleId]);
}

export async function getByGithubAccount(client : db.Client, githubId : string) : Promise<RowWithOrg[]> {
    return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                        + " on u.developer_org = o.id where github_id = ?", [githubId]);
}

export async function getByCloudId(client : db.Client, cloudId : string) : Promise<RowWithOrg[]> {
    return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                        + " on u.developer_org = o.id where cloud_id = ?", [cloudId]);
}

export async function getByCloudIdForProfile(client : db.Client, cloudId : string) : Promise<RowWithOrg & { developer_org_id_hash : string|null }> {
    return db.selectOne(client, "select u.*, o.developer_key, o.name as developer_org_name, o.id_hash as developer_org_id_hash from users u left join organizations o"
                        + " on u.developer_org = o.id where cloud_id = ?", [cloudId]);
}

export async function getIdByCloudId(client : db.Client, cloudId : string) : Promise<Pick<Row, "id">> {
    return db.selectOne(client, "select id from users u where cloud_id = ?", [cloudId]);
}

export async function getByDeveloperOrg(client : db.Client, developerOrg : number) : Promise<Row[]> {
    return db.selectAll(client, "select u.* from users u where u.developer_org = ?", [developerOrg]);
}

export async function update<T extends Partial<Row>>(client : db.Client, id : number, user : T) : Promise<T> {
    await db.query(client, "update users set ? where id = ?", [user, id]);
    return user;
}
async function _delete(client : db.Client, id : number) : Promise<void> {
    await db.query(client, "delete from users where id = ?", [id]);
}
export { _delete as delete };

export async function getAll(client : db.Client, start : number, end : number, sort : string) : Promise<RowWithOrg[]> {
    const [sortField, sortDirection] = sort.split('/');
    assert(sortDirection === 'asc' || sortDirection === 'desc');

    return db.selectAll(client, `select u.*, o.developer_key, o.name as developer_org_name
        from users u left join organizations o on u.developer_org = o.id
        order by ?? ${sortDirection} limit ?,?`, [sortField, start, end]);
}

export async function getAllForShardId(client : db.Client, shardId : number) : Promise<RowWithOrg[]> {
    return db.selectAll(client, `select u.*, o.developer_key, o.name as developer_org_name
        from users u left join organizations o on u.developer_org = o.id where u.id % ? = ? order by id`, [nshards, shardId]);
}

export async function recordLogin(client : db.Client, userId : number) : Promise<void> {
    await db.query(client, "update users set lastlog_time = current_timestamp where id = ?", [userId]);
}

export async function subscribe(client : db.Client, email : string) : Promise<void> {
    await db.query(client, "insert into subscribe (email) values (?)", [email]);
}

export async function verifyEmail(client : db.Client, cloudId : string, email : string) : Promise<void> {
    await db.query(client, "update users set email_verified = true where cloud_id = ? and email = ?", [cloudId, email]);
}
