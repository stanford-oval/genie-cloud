// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

function addRectangle(client, bg_id, rect) {
    return db.insertOne(client, "insert into background_rectangle values " +
        "(null, ?,   ?, ?, ?, ?,   ?, ?, ?,   ?, ?, ?, ?,   ?, ?, ?, ?, ?)", [
        bg_id,
        rect.coordinates[0][1], rect.coordinates[1][1], rect.coordinates[0][0], rect.coordinates[1][0],
        rect.label, rect.index, rect.cover,
        rect['font-family'] || null, rect['font-size'] || null, rect['font-color'] || null, rect['text-align'] || null,
        JSON.stringify(rect['color']),
        JSON.stringify(rect['top-color']),
        JSON.stringify(rect['bottom-color']),
        JSON.stringify(rect['left-color']),
        JSON.stringify(rect['right-color'])
    ]);
}

function addTag(client, bg_id, tag) {
    return db.insertOne(client, "insert into background_tag values (?, ?, false)", [bg_id, tag]);
}

module.exports = {
    add(client, bg, user_id, hash) {
        return db.insertOne(client, "insert into background values (null, ?, null, null, ?, ?, ?)", [
            user_id, hash, JSON.stringify(bg['corner-colors']), JSON.stringify(bg['color-palette'])
        ]).then((bg_id) => {
            return Promise.all(bg.tags.map((tag) => addTag(client, bg_id, tag))).then(() => {
                return Promise.all(bg.rectangles.map((rect) => addRectangle(client, bg_id, rect)));
            });
        });
    },

    get(client) {
        throw new Error('Not implemented.');
    }
};