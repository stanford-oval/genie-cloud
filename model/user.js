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

function create(client, user) {
    return db.insertOne(client, `insert into users set ?`, [user]).then((id) => {
        user.id = id;
        return user;
    });
}

module.exports = {
    get(client, id) {
        return db.selectOne(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where u.id = ?", [id]);
    },

    getSearch(client, search) {
        search = '%' + search + '%';
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where username like ? or human_name like ? or email like ?",
                            [search, search, search]);
    },

    getByName(client, username) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where username = ?", [username]);
    },

    getByGoogleAccount(client, googleId) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where google_id = ?", [googleId]);
    },

    getByCloudId(client, cloudId) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where cloud_id = ?", [cloudId]);
    },

    getIdByCloudId(client, cloudId) {
        return db.selectOne(client, "select id from users u where cloud_id = ?", [cloudId]);
    },

    getByAccessToken(client, accessToken) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id, oauth2_access_tokens oat where"
                            + " oat.user_id = u.id and oat.token = ?",
                            [accessToken]);
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

    getAll(client, start, end) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                                + " on u.developer_org = o.id order by id limit ?,?", [start,end]);
        } else {
            return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                                + " on u.developer_org = o.id order by id");
        }
    },

    recordLogin(client, userId) {
        return db.query(client, "update users set lastlog_time = current_timestamp where id = ?", [userId]);
    },

    subscribe(client, email) {
        return db.query(client, "insert into subscribe (email) values (?)", email);
    }
};
