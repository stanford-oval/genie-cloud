// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

function create(client, org) {
    var KEYS = ['name', 'comment', 'developer_key'];
    KEYS.forEach((key) => {
        if (org[key] === undefined)
            org[key] = null;
    });
    var vals = KEYS.map((key) => org[key]);
    var marks = KEYS.map(() => '?');

    return db.insertOne(client, 'insert into organizations(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then((id) => {
                            org.id = id;
                            return org;
                        });
}

module.exports = {
    get(client, id) {
        return db.selectOne(client, "select * from organizations where id = ?",
                            [id]);
    },

    getAll(client, start, end) {
        if (start !== undefined && end !== undefined)
            return db.selectAll(client, "select * from organizations order by id limit ?,?", [start,end]);
        else
            return db.selectAll(client, "select * from organizations order by id");
    },

    getByFuzzySearch(client, tag) {
        var pctag = '%' + tag + '%';
        return db.selectAll(client, `(select * from organizations where name like ? or comment like ?)
                            union distinct (select o.* from organizations o where exists (select 1 from users 
                            where username = ? and developer_org = o.id))`,
                            [pctag, pctag, tag]);
    },

    getMembers(client, id) {
        return db.selectAll(client, "select username from users where developer_org = ?", [id]);
    },

    getByDeveloperKey(client, key) {
        return db.selectAll(client, "select id,is_admin from organizations where developer_key = ?", [key]);
    },

    create: create,

    update(client, id, org) {
        return db.query(client, "update organizations set ? where id = ?", [org, id]);
    },

    'delete'(client, id) {
        return db.query(client, "delete from organizations where id = ?", [id]);
    }
};
