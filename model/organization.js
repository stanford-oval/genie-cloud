// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function create(client, org) {
    var KEYS = ['name', 'developer_key'];
    KEYS.forEach(function(key) {
        if (org[key] === undefined)
            org[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return org[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into organizations(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then(function(id) {
                            org.id = id;
                            return org;
                        });
}

module.exports = {
    get: function(client, id) {
        return db.selectOne(client, "select * from organizations where id = ?",
                            [id]);
    },

    getByDeveloperKey: function(client, key) {
        return db.selectAll(client, "select id from organizations where developer_key = ?", [key]);
    },

    create: create,

    update: function(client, id, org) {
        return db.query(client, "update organizations set ? where id = ?", [org, id]);
    },

    'delete': function(client, id) {
        return db.query(client, "delete from organizations where id = ?", [id]);
    }
};
