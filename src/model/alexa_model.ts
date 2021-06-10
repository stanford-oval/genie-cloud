// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as db from '../util/db';

export interface Row {
    id : number;
    language : string;
    tag : string;
    call_phrase : string;
    owner : number;
    access_token : string|null;
    anonymous_user : number|null;
    all_devices : boolean;
}
export type OptionalFields = 'language' | 'access_token' | 'all_devices';

export async function getByTag(client : db.Client, language : string, tag : string) : Promise<Row> {
    return db.selectOne(client, "select * from alexa_models where language = ? and tag = ?", [language, tag]);
}
export async function getByTagForUpdate(client : db.Client, language : string, tag : string) : Promise<Row> {
    return db.selectOne(client, "select * from alexa_models where language = ? and tag = ? for update", [language, tag]);
}

export async function getByOwner(client : db.Client, owner : number) : Promise<Row[]> {
    return db.selectAll(client, "select * from alexa_models where owner = ?", [owner]);
}

export async function create<T extends db.Optional<Row, OptionalFields>>(client : db.Client, model : db.WithoutID<T>, for_devices : string[] = []) : Promise<db.WithID<T>> {
    const id = await db.insertOne(client, "replace into alexa_models set ?", [model]);
    if (for_devices.length > 0)
        await db.insertOne(client, "insert into alexa_model_devices(model_id, schema_id) select ?,id from device_schema where kind in (?)", [id, for_devices]);
    model.id = id;
    return model as db.WithID<T>;
}

export async function getIntents(client : db.Client, modelId : number) : Promise<any[]> {
    return db.selectAll(client, `
        (select ex.*, ds.kind from example_utterances ex, alexa_model_devices amd, device_schema ds, alexa_models am
            where am.id = ? and not am.all_devices and amd.model_id = am.id and ex.schema_id = amd.schema_id and ds.id = amd.schema_id
            and ex.language = am.language)
        union
        (select ex.*, ds.kind from example_utterances ex, device_schema ds, alexa_models am
            where am.id = ? and am.all_devices and
            (ds.approved_version is not null or ds.owner = am.owner)
            and ex.schema_id = ds.id
            and ex.language = am.language)
        order by id asc`, [modelId, modelId]);
}
