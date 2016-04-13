// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function create(client, user) {
    var KEYS = ['username', 'human_name', 'email', 'google_id',
                'facebook_id', 'omlet_id', 'password', 'salt',
                'cloud_id', 'auth_token',
                'developer_org'];
    KEYS.forEach(function(key) {
        if (user[key] === undefined)
            user[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return user[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into users(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then(function(id) {
                            user.id = id;
                            return user;
                        });
}

module.exports = {
    get: function(client, id) {
        return db.selectOne(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where u.id = ?", [id]);
    },

    getByName: function(client, username) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where username = ?", [username]);
    },

    getByGoogleAccount: function(client, googleId) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where google_id = ?", [googleId]);
    },

    getByFacebookAccount: function(client, facebookId) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where facebook_id = ?", [facebookId]);
    },

    getByOmletAccount: function(client, omletId) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where omlet_id = ?", [omletId]);
    },

    getByCloudId: function(client, cloudId) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id where cloud_id = ?", [cloudId]);
    },

    getByAccessToken: function(client, accessToken) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id, oauth2_access_tokens oat where"
                            + " oat.user_id = u.id and oat.token = ?",
                            [accessToken]);
    },

    create: create,

    update: function(client, id, user) {
        return db.query(client, "update users set ? where id = ?", [user, id]);
    },

    'delete': function(client, id) {
        return db.query(client, "delete from users where id = ?", [id]);
    },

    getAll: function(client) {
        return db.selectAll(client, "select u.*, o.developer_key from users u left join organizations o"
                            + " on u.developer_org = o.id order by id");
    },
}
