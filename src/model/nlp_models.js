// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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


import assert from 'assert';

import * as db from '../util/db';

function loadModels(rows) {
    const models = [];

    let current = null;

    for (let row of rows) {
        if (current && current.id === row.id) {
            assert(row.kind !== null);
            current.for_devices.push(row.kind);
        } else {
            current = row;
            current.flags = JSON.parse(row.flags);
            if (row.kind)
                current.for_devices = [row.kind];
            else
                current.for_devices = [];
            models.push(current);
        }
    }

    return models;
}

export async function getAll(client) {
    return db.selectAll(client, "select * from models");
}
export async function getTrained(client) {
    return db.selectAll(client, "select * from models where trained");
}

export async function getPublic(client, owner) {
    return db.selectAll(client,
        `(select m.*, tpl.tag as template_file_name, null as kind
            from models m, template_files tpl where tpl.id = m.template_file
            and all_devices and (m.access_token is null or m.owner = ?))
            union
            (select m.*, tpl.tag as template_file_name, ds.kind
            from models m, template_files tpl, model_devices md, device_schema ds
            where tpl.id = m.template_file
            and not m.all_devices and (m.access_token is null or m.owner = ?)
            and md.schema_id = ds.id and md.model_id = m.id)
            order by id`, [owner, owner]).then(loadModels);
}

export async function getByOwner(client, owner) {
    return db.selectAll(client,
        `(select m.*, tpl.tag as template_file_name, null as kind
            from models m, template_files tpl where tpl.id = m.template_file
            and all_devices and m.owner = ?)
            union
            (select m.*, tpl.tag as template_file_name, ds.kind
            from models m, template_files tpl, model_devices md, device_schema ds
            where tpl.id = m.template_file
            and not m.all_devices and m.owner = ?
            and md.schema_id = ds.id and md.model_id = m.id)
            order by id`, [owner, owner]).then(loadModels);
}

export async function getForLanguage(client, language) {
    return db.selectAll(client,
        `(select m.*, tpl.tag as template_file_name, null as kind
            from models m, template_files tpl where tpl.id = m.template_file
            and all_devices and m.language = ?)
            union
            (select m.*, tpl.tag as template_file_name, ds.kind
            from models m, template_files tpl, model_devices md, device_schema ds
            where tpl.id = m.template_file
            and not m.all_devices and m.language = ?
            and md.schema_id = ds.id and md.model_id = m.id)
            order by id`, [language, language]).then(loadModels);
}

export async function getByTag(client, language, tag) {
    return db.selectAll(client, `
        (select m.*, tpl.tag as template_file_name, null as kind
            from models m, template_files tpl where tpl.id = m.template_file
            and all_devices and m.language = ? and m.tag = ?)
            union
            (select m.*, tpl.tag as template_file_name, ds.kind
            from models m, template_files tpl, model_devices md, device_schema ds
            where tpl.id = m.template_file
            and not m.all_devices and m.language = ? and m.tag = ?
            and md.schema_id = ds.id and md.model_id = m.id)
            order by id`, [language, tag, language, tag]).then(loadModels);
}
export async function getByTagForUpdate(client, language, tag) {
    return db.selectOne(client, `select m.*, tpl.tag as template_file_name
            from models m, template_files tpl where tpl.id = m.template_file
            and m.language = ? and m.tag = ? for update`, [language, tag]);
}

export async function getForDevices(client, language, devices) {
    return db.selectAll(client,
        `(select m.*, tpl.tag as template_file_name, null as kind
            from models m, template_files tpl where tpl.id = m.template_file
            and all_devices and use_approved and m.language = ? and
            exists (select 1 from device_schema where kind in (?) and approved_version is not null))
            union
            (select m.*, tpl.tag as template_file_name, null as kind
            from models m, template_files tpl where tpl.id = m.template_file
            and all_devices and not use_approved and m.language = ? and
                exists (select 1 from device_schema where kind in (?) ))
            union
            (select m.*, tpl.tag as template_file_name, ds.kind
            from models m, template_files tpl, model_devices md, device_schema ds
            where tpl.id = m.template_file
            and not m.all_devices and m.language = ?
            and md.schema_id = ds.id and md.model_id = m.id and ds.kind in (?) )
            order by id`,
        [language, devices, language, devices, language, devices]).then(loadModels);
}

export async function create(client, model, for_devices = []) {
    const id = await db.insertOne(client, "replace into models set ?", [model]);
    if (for_devices.length > 0)
        await db.insertOne(client, "insert into model_devices(model_id, schema_id) select ?,id from device_schema where kind in (?)", [id, for_devices]);
    model.id = id;
    return model;
}

export async function updateByTag(client, language, tag, model) {
    return db.query(client, `update models set ? where language = ? and tag = ?`, [model, language, tag]);
}

export async function update(client, id, model) {
    return db.query(client, `update models set ? where id = ?`, [model, id]);
}
