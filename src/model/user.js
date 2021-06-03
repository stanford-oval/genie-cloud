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


const assert = require('assert');

const db = require('../util/db');

const nshards = require('../config').THINGENGINE_MANAGER_ADDRESS.length;

function create(client, user) {
    return db.insertOne(client, `insert into users set ?`, [user]).then((id) => {
        user.id = id;
        return user;
    });
}

module.exports = {
    get(client, id) {
        return db.selectOne(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                            + " on u.developer_org = o.id where u.id = ?", [id]);
    },

    getSearch(client, search) {
        search = '%' + search + '%';
        return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                            + " on u.developer_org = o.id where username like ? or human_name like ? or email like ?",
                            [search, search, search]);
    },

    getByName(client, username) {
        return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                            + " on u.developer_org = o.id where username = ?", [username]);
    },

    getByEmail(client, email) {
        return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                            + " on u.developer_org = o.id where email = ?", [email]);
    },

    getByGoogleAccount(client, googleId) {
        return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                            + " on u.developer_org = o.id where google_id = ?", [googleId]);
    },

    getByGithubAccount(client, githubId) {
        return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                            + " on u.developer_org = o.id where github_id = ?", [githubId]);
    },

    getByCloudId(client, cloudId) {
        return db.selectAll(client, "select u.*, o.developer_key, o.name as developer_org_name from users u left join organizations o"
                            + " on u.developer_org = o.id where cloud_id = ?", [cloudId]);
    },

    getByCloudIdForProfile(client, cloudId) {
        return db.selectOne(client, "select u.*, o.developer_key, o.name as developer_org_name, o.id_hash as developer_org_id_hash from users u left join organizations o"
                            + " on u.developer_org = o.id where cloud_id = ?", [cloudId]);
    },

    getIdByCloudId(client, cloudId) {
        return db.selectOne(client, "select id from users u where cloud_id = ?", [cloudId]);
    },

    getByDeveloperOrg(client, developerOrg) {
        return db.selectAll(client, "select u.* from users u where u.developer_org = ?", [developerOrg]);
    },

    create,

    update(client, id, user) {
        return db.query(client, "update users set ? where id = ?", [user, id]);
    },
    delete(client, id) {
        return db.query(client, "delete from users where id = ?", [id]);
    },

    getAll(client, start, end, sort) {
        const [sortField, sortDirection] = sort.split('/');
        assert(sortDirection === 'asc' || sortDirection === 'desc');

        return db.selectAll(client, `select u.*, o.developer_key, o.name as developer_org_name
            from users u left join organizations o on u.developer_org = o.id
            order by ?? ${sortDirection} limit ?,?`, [sortField, start, end]);
    },

    getAllForShardId(client, shardId) {
        return db.selectAll(client, `select u.*, o.developer_key, o.name as developer_org_name
            from users u left join organizations o on u.developer_org = o.id where u.id % ? = ? order by id`, [nshards, shardId]);
    },

    recordLogin(client, userId) {
        return db.query(client, "update users set lastlog_time = current_timestamp where id = ?", [userId]);
    },

    subscribe(client, email) {
        return db.query(client, "insert into subscribe (email) values (?)", email);
    },

    verifyEmail(client, cloudId, email) {
        return db.query(client, "update users set email_verified = true where cloud_id = ? and email = ?", [cloudId, email]);
    }
};
