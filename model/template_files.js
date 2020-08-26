// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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
