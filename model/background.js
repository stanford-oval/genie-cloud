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

function getRectangles(client, bg_id) {
    return db.selectAll(client, "select * from background_rectangle where background_id = ?" [bg_id]);
}

function addTag(client, bg_id, tag) {
    return db.insertOne(client, "insert into background_tag values (?, ?, false)", [bg_id, tag]);
}

function getTags(client, bg_id) {
    return db.selectAll(client, "select tag from background_tag where background_id = ?", [bg_id]);
}

function getBackground(client, bg_id) {
    return db.selectOne(client, "select * from background where id = ? ", [bg_id]);
}

function processRectangleRows(rows) {
    let out = {};
    rows.forEach((row) => {
        let rect = {
            top: row.coord_top,
            bottom: row.coord_bottom,
            left: row.coord_left,
            right: row.coord_right,
            label: row.label,
            index: row.order_index,
            cover: row.cover,
            'font-family': row.font_family,
            'font-size': row.font_size,
            'font-color': row.font_color,
            'text-align': row.text_align,
            color: JSON.parse(row.color),
            'top-color': JSON.parse(row.top_color),
            'bottom-color': JSON.parse(row.bottom_color),
            'left-color': JSON.parse(row.left_color),
            'right-color': JSON.parse(row.right_color),
        };
        if (row.background_id in out) {
            out[row.background_id].rectangles.push(rect);
        } else {
            out[row.background_id] = {
                owner: row.owner,
                schema_id: row.schema_id,
                function_name: row.function_name,
                hash: row.hash,
                'corner-colors': JSON.parse(row.corner_colors),
                'color-palette': JSON.parse(row.color_palette),
                rectangles: [rect]
            };
        }
    });
    return out;
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

    getByTags(client, tags) {
        return db.selectAll(client, "select bg.*, rect.* from background bg " +
            "left join background_rectangle rect on bg.id = rect.background_id " +
            "left join background_tag tag on bg.id = tag.background_id " +
            "where tag.tag in (?)", [tags]).then(processRectangleRows);
    }
};