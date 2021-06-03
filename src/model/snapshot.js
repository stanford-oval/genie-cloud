// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
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