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
    var KEYS = ['owner', 'name', 'description', 'code'];
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
                            + "join users u on r.owner = u.id where r.id = ?", [id]);
    },

    getByOwner: function(client, owner) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer " +
                            "join users u on r.owner = u.id where r.owner = ? order by r.name asc",
                            [owner]);
    },

    getByTag: function(client, tag) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer " +
                            "join users u on r.owner = u.id, app_tag rt where rt.app_id = r.id " +
                            " and rt.tag = ? order by r.name", [tag]);
    },

    getByFuzzySearch: function(client, tag) {
        var pctag = '%' + tag + '%';
        return db.selectAll(client, "(select 0 as weight, r.*, if(u.human_name is not null and "
                            + "u.human_name <> '', u.human_name, u.username) as owner_name from " +
                            "app r left outer " +
                            "join users u on r.owner = u.id, app_tag " +
                            " rt where rt.app_id = r.id and rt.tag = ?) union distinct " +
                            "(select 1, r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer " +
                            "join users u on r.owner = u.id where name like ? or description like ?) " +
                            "union distinct (select 2, r.*, if(u.human_name is not null and "
                            + "u.human_name <> '', u.human_name, u.username) as owner_name from app"
                            + " r left " +
                            " outer join users u on r.owner = u.id, device_class d, app_device rd " +
                            " where rd.device_id = d.id and rd.app_id = r.id and d.name like ? or "
                            + "d.description like ?) order by weight asc, name asc limit 20",
                            [tag, pctag, pctag, pctag, pctag]);
    },

    getByDevice: function(client, deviceId) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer " +
                            "join users u on r.owner = u.id, app_device rd " +
                            " where rd.app_id = r.id and rd.device_id = ? order by r.name asc",
                            [deviceId]);
    },

    getByDevicePrimaryKind: function(client, kind) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer " +
                            "join users u on r.owner = u.id, device_class d, app_device rd " +
                            " where rd.app_id = r.id and rd.device_id = d.id and " +
                            " d.primary_kind = ? order by r.name asc", [kind]);
    },

    getByDeviceAnyKind: function(client, kind) {
        return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                            + " u.human_name, u.username) as owner_name from app r left outer " +
                            "join users u on r.owner = u.id, device_class d, app_device rd, " +
                            "device_class_kind dk where rd.app_id = r.id and rd.device_id = d.id " +
                            " and dk.device_id = d.id and dk.kind = ? order by r.name asc", [kind]);
    },

    create: create,

    update: function(client, id, app) {
        return db.query(client, "update app set ? where id = ?", [app, id]);
    },

    'delete': function(client, id) {
        return db.query(client, "delete from app where id = ?", [id]);
    },

    getAll: function(client, start, end) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                                + " u.human_name, u.username) as owner_name from app r left " +
                                " outer join users u on r.owner = u.id order by r.name limit ?,?",
                                [start, end]);
        } else {
            return db.selectAll(client, "select r.*, if(u.human_name is not null and u.human_name <> '',"
                                + " u.human_name, u.username) as owner_name from app r left " +
                                " outer join users u on r.owner = u.id order by r.name");
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
