// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    getAll(client) {
        return db.selectAll(client, "select * from template_files");
    },

    getPublic(client, owner) {
        return db.selectAll(client, "select * from template_files where public or owner = ?", [owner]);
    },

    getByOwner(client, owner) {
        return db.selectAll(client, "select * from template_files where owner = ?", [owner]);
    },

    getForLanguage(client, language) {
        return db.selectAll(client, "select * from template_files where language = ?", [language]);
    },

    getByTag(client, language, tag) {
        return db.selectOne(client, "select * from template_files where language = ? and tag = ?", [language, tag]);
    },
    getByTagForUpdate(client, language, tag) {
        return db.selectOne(client, "select * from template_files where language = ? and tag = ? for update", [language, tag]);
    },

    async create(client, tmpl) {
        const id = await db.insertOne(client, "insert into template_files set ?", [tmpl]);
        tmpl.id = id;
        return tmpl;
    },
    update(client, tmplId, tmpl) {
        return db.query(client, `update template_files set ? where id = ?`, [tmpl, tmplId]);
    }
};
