// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
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

export type SchemaKindType = 'primary'|'app'|'category'|'discovery'|'other';

export interface Row {
    id : number;
    kind : string;
    kind_type : SchemaKindType;
    owner : number;
    developer_version : number;
    approved_version : number|null;
    kind_canonical : string;
}
export type OptionalFields = 'kind_type' | 'owner' | 'approved_version' | 'kind_canonical';

export interface ChannelRow {
    schema_id : number;
    version : number;
    name : string;
    channel_type : 'trigger'|'action'|'query';
    extends : string|null;
    types : string;
    argnames : string;
    required : string;
    is_input : string;
    string_values : string;
    doc : string;
    is_list : boolean;
    is_monitorable : boolean;
    confirm : boolean;
}
export type ChannelOptionalFields = 'is_list' | 'is_monitorable' | 'confirm';

export interface ChannelCanonicalRow {
    schema_id : number;
    version : number;
    language : string;
    name : string;
    canonical : string;
    confirmation : string|null;
    confirmation_remote : string|null;
    formatted : string|null;
    questions : string;
    argcanonicals : string;
}
export type ChannelCanonicalOptionalFields = 'language' | 'confirmation' | 'confirmation_remote' | 'formatted';

export interface TranslationRecord {
    canonical : string;
    confirmation : string;
    confirmation_remote ?: string;
    formatted : unknown[];
    argcanonicals : unknown[];
    questions : string[];
}

export async function insertTranslations(dbClient : db.Client,
                                         schemaId : number,
                                         version : number,
                                         language : string,
                                         translations : Record<string, TranslationRecord>) {
    const channelCanonicals : Array<[number, number, string, string, string, string, string, string, string, string]> = [];

    for (const name in translations) {
        const meta = translations[name];

        channelCanonicals.push([schemaId, version, language, name,
                                meta.canonical,
                                meta.confirmation,
                                meta.confirmation_remote || meta.confirmation,
                                JSON.stringify(meta.formatted),
                                JSON.stringify(meta.argcanonicals),
                                JSON.stringify(meta.questions)]);
    }

    if (channelCanonicals.length === 0)
        return Promise.resolve();

    return db.insertOne(dbClient, 'replace into device_schema_channel_canonicals(schema_id, version, language, name, '
            + 'canonical, confirmation, confirmation_remote, formatted, argcanonicals, questions) values ?', [channelCanonicals]);
}

export interface SchemaChannelMetadata {
    canonical : string;
    confirmation : string|null;
    confirmation_remote : string|null;
    doc : string;
    extends : string[]|null;
    types : string[];
    args : string[];
    required : boolean[];
    is_input : boolean[];
    string_values : string[];
    formatted : unknown[];
    argcanonicals : unknown[];
    questions : string[];
    is_list : boolean;
    is_monitorable : boolean;
    confirm : boolean;
}

export interface SchemaMetadata {
    kind : string;
    kind_type : SchemaKindType;
    kind_canonical : string;
    triggers : Record<string, SchemaChannelMetadata>;
    queries : Record<string, SchemaChannelMetadata>;
    actions : Record<string, SchemaChannelMetadata>;
}

export interface SchemaChannelTypes {
    extends ?: string[];
    types : string[];
    args : string[];
    required : boolean[];
    is_input : boolean[];
    is_list : boolean;
    is_monitorable : boolean;
}

export interface SchemaTypes {
    kind : string;
    kind_type : SchemaKindType;
    triggers : Record<string, SchemaChannelTypes>;
    queries : Record<string, SchemaChannelTypes>;
    actions : Record<string, SchemaChannelTypes>;
}

export async function insertChannels(dbClient : db.Client,
                                     schemaId : number,
                                     schemaKind : string,
                                     kindType : SchemaKindType|undefined,
                                     version : number,
                                     language : string,
                                     metas : SchemaMetadata) {
    const channels : Array<[number, number, string, 'trigger'|'query'|'action', string, string|null,
        string, string, string, string, string, boolean, boolean, boolean]> = [];
    const channelCanonicals : Array<[number, number, string, string, string, string|null, string|null,
        string, string, string]> = [];

    function makeList(what : 'trigger'|'query'|'action', from : Record<string, SchemaChannelMetadata>) {
        for (const name in from) {
            const meta = from[name];
            channels.push([schemaId, version, name, what,
                           meta.doc,
                           meta.extends && meta.extends.length ? JSON.stringify(meta.extends) : null,
                           JSON.stringify(meta.types),
                           JSON.stringify(meta.args),
                           JSON.stringify(meta.required),
                           JSON.stringify(meta.is_input),
                           JSON.stringify(meta.string_values),
                           !!meta.is_list,
                           !!meta.is_monitorable,
                           !!meta.confirm]);
            channelCanonicals.push([schemaId, version, language, name,
                                    meta.canonical,
                                    meta.confirmation,
                                    meta.confirmation_remote,
                                    JSON.stringify(meta.formatted),
                                    JSON.stringify(meta.argcanonicals),
                                    JSON.stringify(meta.questions)]);
        }
    }

    makeList('trigger', metas.triggers || {});
    makeList('query', metas.queries || {});
    makeList('action', metas.actions || {});

    if (channels.length === 0)
        return Promise.resolve();

    return db.insertOne(dbClient, 'insert into device_schema_channels(schema_id, version, name, '
        + 'channel_type, doc, extends, types, argnames, required, is_input, string_values, is_list, is_monitorable, confirm) values ?', [channels])
        .then(() => {
            return db.insertOne(dbClient, 'insert into device_schema_channel_canonicals(schema_id, version, language, name, '
            + 'canonical, confirmation, confirmation_remote, formatted, argcanonicals, questions) values ?', [channelCanonicals]);
        });
}

export async function create<T extends db.Optional<Row, OptionalFields>>(client : db.Client, schema : db.WithoutID<T>, meta : SchemaMetadata) : Promise<db.WithID<T>> {
    const KEYS = ['kind', 'kind_canonical', 'kind_type', 'owner', 'approved_version', 'developer_version'] as const;
    const vals = KEYS.map((key) => schema[key]);
    const marks = KEYS.map(() => '?');

    return db.insertOne(client, 'insert into device_schema(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then((id) => {
        schema.id = id;
        return insertChannels(client, id, schema.kind, schema.kind_type, schema.developer_version, 'en', meta);
    }).then(() => schema as db.WithID<T>);
}

export async function update<T extends Partial<Row> & { developer_version : number }>(client : db.Client, id : number, kind : string, schema : T, meta : SchemaMetadata) : Promise<db.WithID<T>> {
    return db.query(client, "update device_schema set ? where id = ?", [schema, id]).then(() => {
        return insertChannels(client, id, kind, schema.kind_type, schema.developer_version, 'en', meta);
    }).then(() => {
        schema.id = id;
        return schema as db.WithID<T>;
    });
}

function processMetaRows(rows : Array<Row & ChannelRow & ChannelCanonicalRow>) {
    const out : SchemaMetadata[] = [];
    let current : SchemaMetadata|null = null;
    rows.forEach((row) => {
        if (current === null || current.kind !== row.kind) {
            current = {
                kind: row.kind,
                kind_type: row.kind_type,
                kind_canonical: row.kind_canonical,
                triggers: {},
                queries: {},
                actions: {}
            };
            out.push(current);
        }
        if (row.channel_type === null)
            return;
        const types = JSON.parse(row.types);
        const obj : SchemaChannelMetadata = {
            extends: JSON.parse(row.extends || 'null'),
            types: types,
            args: JSON.parse(row.argnames),
            required: JSON.parse(row.required) || [],
            is_input: JSON.parse(row.is_input) || [],
            is_list: !!row.is_list,
            is_monitorable: !!row.is_monitorable,
            confirm: !!row.confirm,
            confirmation: row.confirmation,
            confirmation_remote: row.confirmation_remote || row.confirmation, // for compatibility
            formatted: JSON.parse(row.formatted || '[]'),
            doc: row.doc,
            canonical: row.canonical,
            argcanonicals: JSON.parse(row.argcanonicals) || [],
            questions: JSON.parse(row.questions) || [],
            string_values: JSON.parse(row.string_values) || [],
        };
        if (obj.args.length < types.length) {
            for (let i = obj.args.length; i < types.length; i++)
                obj.args[i] = 'arg' + (i+1);
        }
        switch (row.channel_type) {
        case 'action':
            current.actions[row.name] = obj;
            break;
        case 'trigger':
            current.triggers[row.name] = obj;
            break;
        case 'query':
            current.queries[row.name] = obj;
            break;
        default:
            throw new TypeError();
        }
    });
    return out;
}

function processTypeRows(rows : Array<Row & ChannelRow>) {
    const out : SchemaTypes[] = [];
    let current : SchemaTypes|null = null;
    rows.forEach((row) => {
        if (current === null || current.kind !== row.kind) {
            current = {
                kind: row.kind,
                kind_type: row.kind_type,
                triggers: {},
                queries: {},
                actions: {}
            };
            out.push(current);
        }
        if (row.channel_type === null)
            return;
        const obj : SchemaChannelTypes = {
            extends: JSON.parse(row.extends || 'null'),
            types: JSON.parse(row.types),
            args: JSON.parse(row.argnames),
            required: JSON.parse(row.required),
            is_input: JSON.parse(row.is_input),
            is_list: !!row.is_list,
            is_monitorable: !!row.is_monitorable,
        };
        switch (row.channel_type) {
        case 'action':
            current.actions[row.name] = obj;
            break;
        case 'trigger':
            current.triggers[row.name] = obj;
            break;
        case 'query':
            current.queries[row.name] = obj;
            break;
        default:
            throw new TypeError();
        }
    });
    return out;
}

export async function get(client : db.Client, id : number) : Promise<Row> {
    return db.selectOne(client, "select * from device_schema where id = ?", [id]);
}

export async function findNonExisting(client : db.Client, ids : string[], org : number) : Promise<string[]> {
    if (ids.length === 0)
        return Promise.resolve([]);

    const rows : Array<{ kind : string }> = await db.selectAll(client, `select kind from device_schema where kind in (?)
        and (owner = ? or approved_version is not null or exists (select 1 from organizations where organizations.id = ? and is_admin))`,
        [ids, org, org]);
    if (rows.length === ids.length)
        return [];
    const existing = new Set(rows.map((r) => r.kind));
    const missing : string[] = [];
    for (const id of ids) {
        if (!existing.has(id))
            missing.push(id);
    }
    return missing;
}

export async function getAllApproved(client : db.Client, org : number|null) : Promise<Array<{ kind : string, kind_canonical : string }>> {
    if (org === -1) {
        return db.selectAll(client, `select kind, kind_canonical from device_schema
            where kind_type in ('primary','other')`,
            []);
    } else if (org !== null) {
        return db.selectAll(client, `select kind, kind_canonical from device_schema
            where (approved_version is not null or owner = ?)
            and kind_type in ('primary','other')`,
            [org]);
    } else {
        return db.selectAll(client, `select kind, kind_canonical from device_schema
            where approved_version is not null and kind_type in ('primary','other')`,
            []);
    }
}

export async function getCurrentSnapshotTypes(client : db.Client, org : number|null) : Promise<SchemaTypes[]> {
    if (org === -1) {
        return db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and dsc.version = ds.developer_version`,
            []).then(processTypeRows);
    } else if (org !== null) {
        return db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and ((dsc.version = ds.developer_version and ds.owner = ?) or
                (dsc.version = ds.approved_version and ds.owner <> ?))
            where (ds.approved_version is not null or ds.owner = ?)`,
            [org, org, org]).then(processTypeRows);
    } else {
        return db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and dsc.version = ds.approved_version where ds.approved_version is not null`,
            []).then(processTypeRows);
    }
}

export async function getCurrentSnapshotMeta(client : db.Client, language : string, org : number|null) : Promise<SchemaMetadata[]> {
    if (org === -1) {
        return db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            is_list, is_monitorable, string_values, questions, confirm, kind, kind_canonical, kind_type
            from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and dsc.version = ds.developer_version
            left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
            dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?`,
            [language]).then(processMetaRows);
    } else if (org !== null) {
        return db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            is_list, is_monitorable, string_values, questions, confirm, kind, kind_canonical, kind_type
            from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and ((dsc.version = ds.developer_version and ds.owner = ?) or
                    (dsc.version = ds.approved_version and ds.owner <> ?))
            left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
            dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?
            where (ds.approved_version is not null or ds.owner = ?)`,
            [org, org, language, org]).then(processMetaRows);
    } else {
        return db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            is_list, is_monitorable, string_values, questions, confirm, kind, kind_canonical, kind_type
            from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and dsc.version = ds.approved_version
            left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
            dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?
            where ds.approved_version is not null`,
            [language]).then(processMetaRows);
    }
}

export async function getSnapshotTypes(client : db.Client, snapshotId : number, org : number|null) : Promise<SchemaTypes[]> {
    if (org === -1) {
        return db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema_snapshot ds
            left join device_schema_channels dsc on ds.schema_id = dsc.schema_id
            and dsc.version = ds.developer_version and ds.snapshot_id = ?`,
            [snapshotId]).then(processTypeRows);
    } else if (org !== null) {
        return db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema_snapshot ds
            left join device_schema_channels dsc on ds.schema_id = dsc.schema_id
            and ((dsc.version = ds.developer_version and ds.owner = ?) or
                (dsc.version = ds.approved_version and ds.owner <> ?))
            where (ds.approved_version is not null or ds.owner = ?) and ds.snapshot_id = ?`,
            [org, org, org, snapshotId]).then(processTypeRows);
    } else {
        return db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema_snapshot ds
            left join device_schema_channels dsc on ds.schema_id = dsc.schema_id
            and dsc.version = ds.approved_version where ds.approved_version is not null
            and ds.snapshot_id = ?`,
            [snapshotId]).then(processTypeRows);
    }
}

export async function getSnapshotMeta(client : db.Client, snapshotId : number, language : string, org : number|null) : Promise<SchemaMetadata[]> {
    if (org === -1) {
        return db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            is_list, is_monitorable, string_values, questions, confirm, kind, kind_canonical, kind_type
            from device_schema_snapshot ds
            left join device_schema_channels dsc on ds.schema_id = dsc.schema_id
            and dsc.version = ds.developer_version
            left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
            dscc.version = dsc.version and dscc.name = dsc.name
            and dscc.language = ? and ds.snapshot_id = ?`,
            [language, snapshotId]).then(processMetaRows);
    } else if (org !== null) {
        return db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            is_list, is_monitorable, string_values, questions, confirm, kind, kind_canonical, kind_type
            from device_schema_snapshot ds
            left join device_schema_channels dsc on ds.schema_id = dsc.schema_id
            and ((dsc.version = ds.developer_version and ds.owner = ?) or
                    (dsc.version = ds.approved_version and ds.owner <> ?))
            left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
            dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?
            where (ds.approved_version is not null or ds.owner = ?) and ds.snapshot_id = ?`,
            [org, org, language, org, snapshotId]).then(processMetaRows);
    } else {
        return db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            is_list, is_monitorable, string_values, questions, confirm, kind, kind_canonical, kind_type
            from device_schema_snapshot ds
            left join device_schema_channels dsc on ds.schema_id = dsc.schema_id
            and dsc.version = ds.approved_version
            left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
            dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?
            where ds.approved_version is not null and ds.snapshot_id = ?`,
            [language, snapshotId]).then(processMetaRows);
    }
}

export async function getByKind(client : db.Client, kind : string) : Promise<Row> {
    return db.selectOne(client, "select * from device_schema where kind = ?", [kind]);
}

export async function getTypesAndNamesByKinds(client : db.Client, kinds : string[], org : number|null) : Promise<SchemaTypes[]> {
    let rows;
    if (org === -1) {
        rows = await db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and dsc.version = ds.developer_version where ds.kind in (?)`,
            [kinds]);
    } else if (org !== null) {
        rows = await db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and ((dsc.version = ds.developer_version and ds.owner = ?) or
            (dsc.version = ds.approved_version and ds.owner <> ?)) where
            ds.kind in (?) and (ds.approved_version is not null or ds.owner = ?)`,
            [org, org, kinds, org]);
    } else {
        rows = await db.selectAll(client, `select name, extends, types, argnames, required, is_input,
            is_list, is_monitorable, channel_type, kind, kind_type from device_schema ds
            left join device_schema_channels dsc on ds.id = dsc.schema_id
            and dsc.version = ds.approved_version where ds.kind in (?)
            and ds.approved_version is not null`,
            [kinds]);
    }
    return processTypeRows(rows);
}

export async function getMetasByKinds(client : db.Client, kinds : string[], org : number|null, language : string) : Promise<SchemaMetadata[]> {
    let rows;
    if (org === -1) {
        rows = await db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            string_values, is_list, is_monitorable, questions, confirm, kind, kind_canonical, kind_type
            from device_schema ds left join
            device_schema_channels dsc on ds.id = dsc.schema_id and
            dsc.version = ds.developer_version left join device_schema_channel_canonicals dscc
            on dscc.schema_id = dsc.schema_id and dscc.version = dsc.version and
            dscc.name = dsc.name and dscc.language = ? where ds.kind in (?)`,
            [language, kinds]);
    } else if (org !== null) {
        rows = await db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            string_values, is_list, is_monitorable, questions, confirm, kind, kind_canonical, kind_type
            from device_schema ds left join
            device_schema_channels dsc on ds.id = dsc.schema_id and
            ((dsc.version = ds.developer_version and ds.owner = ?) or
                (dsc.version = ds.approved_version and ds.owner <> ?))
            left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id
            and dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?
            where ds.kind in (?) and (ds.approved_version is not null or ds.owner = ?)`,
            [org, org, language, kinds, org]);
    } else {
        rows = await db.selectAll(client, `select dsc.name, channel_type, extends, canonical, confirmation,
            confirmation_remote, formatted, doc, types, argnames, argcanonicals, required, is_input,
            string_values, is_list, is_monitorable, questions, confirm, kind, kind_canonical, kind_type
            from device_schema ds left join device_schema_channels
            dsc on ds.id = dsc.schema_id and dsc.version = ds.approved_version left join
            device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
            dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?
            where ds.kind in (?) and ds.approved_version is not null`,
            [language, kinds]);
    }
    return processMetaRows(rows);
}

export async function getMetasByKindAtVersion(client : db.Client, kind : string[], version : number, language : string) : Promise<SchemaMetadata[]> {
    const rows = await db.selectAll(client, `select dsc.name, channel_type, extends, canonical,
        confirmation, confirmation_remote, formatted, doc, types, argnames, argcanonicals,
        required, is_input, string_values, is_list, is_monitorable, questions, confirm, kind,
        kind_canonical, kind_type
        from device_schema ds left join device_schema_channels dsc
        on ds.id = dsc.schema_id and dsc.version = ?
        left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and
        dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind = ?`,
        [version, language, kind]);
    return processMetaRows(rows);
}

export async function isKindTranslated(client : db.Client, kind : string, language : string) : Promise<boolean> {
    return db.selectOne(client, " select"
        + " (select count(*) from device_schema_channel_canonicals, device_schema"
        + " where language = 'en' and id = schema_id and version = developer_version"
        + " and kind = ?) as english_count, (select count(*) from "
        + "device_schema_channel_canonicals, device_schema where language = ? and "
        + "version = developer_version and id = schema_id and kind = ?) as translated_count",
        [kind, language, kind]).then((row : { english_count : number, translated_count : number }) => {
            return row.english_count <= row.translated_count;
        });
}

async function _delete(client : db.Client, id : number) : Promise<void> {
    await db.query(client, "delete from device_schema where id = ?", [id]);
}
export { _delete as delete };
export async function deleteByKind(client : db.Client, kind : string) : Promise<void> {
    await db.query(client, "delete from device_schema where kind = ?", [kind]);
}

export async function approve(client : db.Client, id : number) : Promise<void> {
    await db.query(client, "update device_schema set approved_version = developer_version where id = ?", [id]);
}

export async function approveByKind(dbClient : db.Client, kind : string) : Promise<void> {
    await db.query(dbClient, "update device_schema set approved_version = developer_version where kind = ?", [kind]);
}
export async function unapproveByKind(dbClient : db.Client, kind : string) : Promise<void> {
    await db.query(dbClient, "update device_schema set approved_version = null where kind = ?", [kind]);
}
