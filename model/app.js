// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function create(client, app) {
    var KEYS = ['app_id', 'owner', 'name', 'description', 'canonical', 'code'];
    KEYS.forEach(function(key) {
        if (app[key] === undefined)
            app[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return app[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into app(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then(function(id) {
                            app.id = id;
                            return app;
                        });
}

module.exports = {
    get: function(client, id) {
        return db.selectOne(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer "
                            + "join users u on r.owner = u.id where r.id = ?",
                            [id]);
    },

    getByAppId: function(client, owner, appId) {
        return db.selectOne(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer "
                            + "join users u on r.owner = u.id where r.owner = ? and r.app_id = ?",
                            [owner, appId]);
    },

    getByCanonical: function(client, canonical) {
        return db.selectOne(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer "
                            + "join users u on r.owner = u.id where match (r.canonical) against "
                            + "(? in natural language mode)", [canonical]);
    },

    getByOwner: function(client, visible, owner) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer "
                            + "join users u on r.owner = u.id where r.owner = ?"
                            + (visible !== null ? " and (r.owner = ? or r.visible)" : "")
                            + " order by r.name asc",
                            [owner, visible]);
    },

    getByTag: function(client, visible, tag) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer "
                            + "join users u on r.owner = u.id, app_tag rt where rt.app_id = r.id "
                            + " and rt.tag = ?"
                            + (visible !== null ? " and (r.owner = ? or r.visible)" : "")
                            + " order by r.name", [tag, visible]);
    },

    getByFuzzySearch: function(client, visible, tag) {
        var pctag = '%' + tag + '%';
        if (visible !== null) {
            return db.selectAll(client, "(select 0 as weight, r.*, if(u.human_name is not null and "
                                + "u.human_name <> '', u.human_name, u.username) as owner_name from "
                                + "app r left outer "
                                + "join users u on r.owner = u.id, app_tag "
                                + " rt where rt.app_id = r.id and rt.tag = ? "
                                + "and (r.owner = ? or r.visible)"
                                + ") union distinct "
                                + "(select 1, r.*, if(u.human_name is not null and u.human_name <> '',"
                                + " u.human_name, u.username) as owner_name from app r left outer "
                                + "join users u on r.owner = u.id where name like ? or description like ?"
                                + " and (r.owner = ? or r.visible)"
                                + ") "
                                + "union distinct (select 2, r.*, if(u.human_name is not null and "
                                + "u.human_name <> '', u.human_name, u.username) as owner_name from app"
                                + " r left "
                                + " outer join users u on r.owner = u.id, device_class d, app_device rd "
                                + " where rd.device_id = d.id and rd.app_id = r.id and d.name like ? or "
                                + "d.description like ?"
                                + " and (r.owner = ? or r.visible)"
                                + ") order by weight asc, name asc limit 20",
                                [tag, visible, pctag, pctag, visible, pctag, pctag, visible]);
        } else {
            return db.selectAll(client, "(select 0 as weight, r.*, if(u.human_name is not null and "
                                + "u.human_name <> '', u.human_name, u.username) as owner_name from "
                                + "app r left outer "
                                + "join users u on r.owner = u.id, app_tag "
                                + " rt where rt.app_id = r.id and rt.tag = ? "
                                + ") union distinct "
                                + "(select 1, r.*, if(u.human_name is not null and u.human_name <> '',"
                                + " u.human_name, u.username) as owner_name from app r left outer "
                                + "join users u on r.owner = u.id where name like ? or description like ?"
                                + ") "
                                + "union distinct (select 2, r.*, if(u.human_name is not null and "
                                + "u.human_name <> '', u.human_name, u.username) as owner_name from app"
                                + " r left "
                                + " outer join users u on r.owner = u.id, device_class d, app_device rd "
                                + " where rd.device_id = d.id and rd.app_id = r.id and d.name like ? or "
                                + "d.description like ?"
                                + ") order by weight asc, name asc limit 20",
                                [tag, pctag, pctag, pctag, pctag]);
        }
    },

    getByDevice: function(client, visible, deviceId) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer "
                            + "join users u on r.owner = u.id, app_device rd "
                            + " where rd.app_id = r.id and rd.device_id = ?"
                            + (visible !== null ? " and (r.owner = ? or r.visible)" : "")
                            + " order by r.name asc",
                            [deviceId, visible]);
    },

    create: create,

    update: function(client, id, app) {
        return db.query(client, "update app set ? where id = ?", [app, id]);
    },

    'delete': function(client, id) {
        return db.query(client, "delete from app where id = ?", [id]);
    },

    getAll: function(client, visible, start, end) {
        if (start !== undefined && end !== undefined) {
            if (visible !== null) {
                return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                                    + " u.human_name, u.username) as owner_name from app r left "
                                    + " outer join users u on r.owner = u.id"
                                    + " where (r.owner = ? or r.visible)"
                                    + " order by r.name limit ?,?",
                                    [visible, start, end]);
            } else {
                return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                                    + " u.human_name, u.username) as owner_name from app r left "
                                    + " outer join users u on r.owner = u.id order by r.name limit ?,?",
                                    [start, end]);
            }
        } else {
            return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                                + " u.human_name, u.username) as owner_name from app r left "
                                + " outer join users u on r.owner = u.id"
                                + (visible !== null ? " where (r.owner = ? or r.visible)" : "")
                                + " order by r.name", [visible]);
        }
    },

    getAllCanonicals: function(client, visible) {
        if (visible !== null) {
            return db.selectAll(client, "select id, canonical from app where (owner = ? or visible)",
                                        [visible]);
        } else {
            return db.selectAll(client, "select id, canonical from app",
                                        [visible]);
        }
    },

    getAllTags: function(client, id) {
        return db.selectAll(client, "select * from app_tag where app_id = ?", [id]);
    },

    removeAllTags: function(client, appId) {
        return db.query(client, "delete from app_tag where app_id = ?", [appId]);
    },

    addTags: function(client, id, tags) {
        if (tags.length === 0)
            return;

        var marks = [];
        var tagIdPairs = [];
        tags.forEach(function(t) {
            marks.push('(?,?)');
            tagIdPairs.push(id);
            tagIdPairs.push(t);
        });

        return db.query(client, "insert into app_tag(app_id, tag) values "
                        + marks.join(','), tagIdPairs);
    },
}
