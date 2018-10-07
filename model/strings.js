// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    create(client, stringType) {
        return db.insertOne(client, `insert into string_types set ?`, [stringType]);
    },
    createMany(client, stringTypes) {
        return db.insertOne(client, `insert into string_types(language, type_name, name) values ?`,
            [stringTypes.map((st) => [st.language, st.type_name, st.name])]);
    },

    get(client, id, language = 'en') {
        return db.selectOne(client, `select * from string_types where id = ? and language = ?`,
                            [id, language]);
    },

    getAll(client, language = 'en') {
        return db.selectAll(client, `select * from string_types where language = ? order by type_name asc`,
            [language]);
    },

    getValues(client, typeName, language = 'en') {
        return db.selectAll(client, `select value, preprocessed from string_values, string_types
            where type_id = id and type_name = ? and language = ?`, [typeName, language]);
    },

    checkAllExist(client, ids) {
        if (ids.length === 0)
            return Promise.resolve();
        return db.selectAll(client, "select type_name from string_types where language='en' and type_name in (?)", [ids]).then((rows) => {
            if (rows.length === ids.length)
                return;
            let existing = new Set(rows.map((r) => r.type_name));
            let missing = [];
            for (let id of ids) {
                if (!existing.has(id))
                    missing.push(id);
            }
            if (missing.length > 0)
                throw new Error('Invalid string types: ' + missing.join(', '));
        });
    }
};
