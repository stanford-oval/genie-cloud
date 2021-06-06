// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

export interface Row {
    id : number;
    language : string;
    tag : string;
    owner : number;
    access_token : string|null;
    template_file : number;
    flags : string;
    contextual : boolean;
    all_devices : boolean;
    use_approved : boolean;
    use_exact : boolean;
    config : string;
    trained : boolean;
    metrics : string|null;
    trained_config : string|null;
    version : number;
}
export type OptionalFields = 'language' | 'access_token' | 'contextual' | 'all_devices'
    | 'use_approved' | 'use_exact' | 'config' | 'trained' | 'metrics' | 'trained_config' | 'version';

export interface RowWithDetails extends Row {
    template_file_name : string;
    kind : string;
    for_devices : string[];
}

function loadModels(rows : RowWithDetails[]) {
    const models : RowWithDetails[] = [];
    let current : RowWithDetails|null = null;

    for (const row of rows) {
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

export async function getAll(client : db.Client) : Promise<Row[]> {
    return db.selectAll(client, "select * from models");
}
export async function getTrained(client : db.Client) : Promise<Row[]> {
    return db.selectAll(client, "select * from models where trained");
}

export async function getPublic(client : db.Client, owner : number|null) : Promise<RowWithDetails[]> {
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

export async function getByOwner(client : db.Client, owner : number) : Promise<RowWithDetails[]> {
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

export async function getForLanguage(client : db.Client, language : string) : Promise<RowWithDetails[]> {
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

export async function getByTag(client : db.Client, language : string, tag : string) : Promise<RowWithDetails[]> {
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
export async function getByTagForUpdate(client : db.Client, language : string, tag : string) : Promise<Row> {
    return db.selectOne(client, `select m.*, tpl.tag as template_file_name
            from models m, template_files tpl where tpl.id = m.template_file
            and m.language = ? and m.tag = ? for update`, [language, tag]);
}

export async function getForDevices(client : db.Client, language : string, devices : string[]) : Promise<RowWithDetails[]> {
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

export async function create<T extends db.Optional<Row, OptionalFields>>(client : db.Client, model : db.WithoutID<T>, for_devices : string[] = []) : Promise<db.WithID<T>> {
    const id = await db.insertOne(client, "replace into models set ?", [model]);
    if (for_devices.length > 0)
        await db.insertOne(client, "insert into model_devices(model_id, schema_id) select ?,id from device_schema where kind in (?)", [id, for_devices]);
    model.id = id;
    return model as db.WithID<T>;
}

export async function updateByTag(client : db.Client, language : string, tag : string, model : Partial<Row>) : Promise<void> {
    await db.query(client, `update models set ? where language = ? and tag = ?`, [model, language, tag]);
}

export async function update(client : db.Client, id : number, model : Partial<Row>) : Promise<void> {
    await db.query(client, `update models set ? where id = ?`, [model, id]);
}
