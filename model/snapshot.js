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

function create(client, snapshot) {
    snapshot.date = new Date;

    return db.insertOne(client, 'insert into snapshot set ?', [snapshot]).then((id) => {
        snapshot.id = id;
        return Promise.all([
            db.query(client, 'insert into device_schema_snapshot select ?,device_schema.* from device_schema', [id]),
            db.query(client, 'insert into entity_names_snapshot select ?,entity_names.* from entity_names', [id])
        ]);
    }).then(() => snapshot);
}

module.exports = {
    create,

    getAll(client, start, end) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, "select * from snapshot order by snapshot_id asc limit ?,?",
                                [start, end]);
        } else {
            return db.selectAll(client, "select * from snapshot order by snapshot_id asc");
        }
    },
};