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
const Q = require('q');

function insertTranslations(dbClient, schemaId, version, language, translations) {
    const channelCanonicals = [];

    for (let name in translations) {
        const meta = translations[name];

        channelCanonicals.push([schemaId, version, language, name,
                                meta.canonical,
                                meta.confirmation,
                                meta.confirmation_remote || meta.confirmation,
                                JSON.stringify(meta.argcanonicals),
                                JSON.stringify(meta.questions)]);
    }

    if (channelCanonicals.length === 0)
        return Q();

    return db.insertOne(dbClient, 'replace into device_schema_channel_canonicals(schema_id, version, language, name, '
            + 'canonical, confirmation, confirmation_remote, argcanonicals, questions) values ?', [channelCanonicals]);
}

function insertChannels(dbClient, schemaId, schemaKind, kindType, version, language, metas) {
    const channels = [];
    const channelCanonicals = [];

    function makeList(what, from) {
        for (let name in from) {
            const meta = from[name];
            channels.push([schemaId, version, name, what,
                           meta.doc,
                           JSON.stringify(meta.schema),
                           JSON.stringify(meta.argnames),
                           JSON.stringify(meta.required),
                           JSON.stringify(meta.is_input)]);
            channelCanonicals.push([schemaId, version, language, name,
                                    meta.canonical,
                                    meta.confirmation,
                                    meta.confirmation_remote,
                                    JSON.stringify(meta.argcanonicals),
                                    JSON.stringify(meta.questions)]);
        }
    }

    makeList('trigger', metas.triggers || {});
    makeList('query', metas.queries || {});
    makeList('action', metas.actions || {});

    if (channels.length === 0)
        return Q();

    return db.insertOne(dbClient, 'insert into device_schema_channels(schema_id, version, name, '
        + 'channel_type, doc, types, argnames, required, is_input) values ?', [channels])
        .then(() => {
            return db.insertOne(dbClient, 'insert into device_schema_channel_canonicals(schema_id, version, language, name, '
            + 'canonical, confirmation, confirmation_remote, argcanonicals, questions) values ?', [channelCanonicals]);
        });
}

function create(client, schema, meta) {
    var KEYS = ['kind', 'kind_canonical', 'kind_type', 'owner', 'approved_version', 'developer_version'];
    KEYS.forEach((key) => {
        if (schema[key] === undefined)
            schema[key] = null;
    });
    var vals = KEYS.map((key) => schema[key]);
    var marks = KEYS.map(() => '?');

    return db.insertOne(client, 'insert into device_schema(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then((id) => {
        schema.id = id;
        return insertChannels(client, schema.id, schema.kind, schema.kind_type, schema.developer_version, 'en', meta);
    }).then(() => schema);
}

function update(client, id, kind, schema, meta) {
    return db.query(client, "update device_schema set ? where id = ?", [schema, id]).then(() => {
    }).then(() => {
        return insertChannels(client, id, kind, schema.kind_type, schema.developer_version, 'en', meta);
    }).then(() => {
        schema.id = id;
        return schema;
    });
}

function processMetaRows(rows) {
    var out = [];
    var current = null;
    rows.forEach((row) => {
        if (current === null || current.kind !== row.kind) {
            current = {
                id: row.id,
                kind: row.kind,
                kind_type: row.kind_type,
                kind_canonical: row.kind_canonical,
                owner: row.owner,
                version: row.version,
                developer_version: row.developer_version,
                approved_version: row.approved_version
            };
            current.triggers = {};
            current.queries = {};
            current.actions = {};
            out.push(current);
        }
        if (row.channel_type === null)
            return;
        var types = JSON.parse(row.types);
        var obj = {
            schema: types,
            args: JSON.parse(row.argnames),
            required: JSON.parse(row.required) || [],
            is_input: JSON.parse(row.is_input) || [],
            confirmation: row.confirmation || row.doc,
            confirmation_remote: row.confirmation_remote || row.confirmation || row.doc,
            formatted: JSON.parse(row.formatted) || [],
            doc: row.doc,
            canonical: row.canonical || '',
            argcanonicals: JSON.parse(row.argcanonicals) || [],
            questions: JSON.parse(row.questions) || [],
        };
        if (obj.args.length < types.length) {
            for (var i = obj.args.length; i < types.length; i++)
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

function processTypeRows(rows) {
    var out = [];
    var current = null;
    rows.forEach((row) => {
        if (current === null || current.kind !== row.kind) {
            current = {
                kind: row.kind,
                kind_type: row.kind_type
            };
            current.triggers = {};
            current.queries = {};
            current.actions = {};
            out.push(current);
        }
        if (row.channel_type === null)
            return;
        var obj = {
            types: JSON.parse(row.types),
            args: JSON.parse(row.argnames),
            required: JSON.parse(row.required),
            is_input: JSON.parse(row.is_input)
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

module.exports = {
    get(client, id) {
        return db.selectOne(client, "select * from device_schema where id = ?", [id]);
    },

    getCurrentSnapshotTypes(client) {
        return db.selectAll(client, "select name, types, argnames, required, is_input, channel_type, kind, kind_type from device_schema ds"
                             + " left join device_schema_channels dsc on ds.id = dsc.schema_id "
                             + " and dsc.version = ds.developer_version",
                             []).then(processTypeRows);
    },

    getCurrentSnapshotMeta(client, language) {
        return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, confirmation_remote, formatted, doc, types,"
                            + " argnames, argcanonicals, required, is_input, questions, ds.id, kind, kind_canonical, kind_type, owner, dsc.version, developer_version,"
                            + " approved_version from device_schema ds"
                            + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                            + " and dsc.version = ds.developer_version "
                            + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                            + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ?",
                            [language]).then(processMetaRows);
    },

    getSnapshotTypes(client, snapshotId) {
        return db.selectAll(client, "select name, types, argnames, required, is_input, channel_type, kind, kind_type from device_schema_snapshot ds"
                             + " left join device_schema_channels dsc on ds.schema_id = dsc.schema_id "
                             + " and dsc.version = ds.developer_version where ds.snapshot_id = ?",
                             [snapshotId]).then(processTypeRows);
    },

    getSnapshotMeta(client, snapshotId, language) {
        return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, confirmation_remote, doc, types,"
                            + " argnames, argcanonicals, required, is_input, questions, ds.schema_id, kind, kind_canonical, kind_type, owner, dsc.version, developer_version,"
                            + " approved_version from device_schema_snapshot ds"
                            + " left join device_schema_channels dsc on ds.schema_id = dsc.schema_id"
                            + " and dsc.version = ds.developer_version "
                            + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                            + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.snapshot_id = ?",
                            [language, snapshotId]).then(processMetaRows);
    },

    getAllForList(client, id) {
        return db.selectAll(client, "select * from device_schema where kind_type <> 'global' order by kind_type desc, kind asc");
    },

    getByKind(client, kind) {
        return db.selectOne(client, "select * from device_schema where kind = ?", [kind]);
    },

    getTypesAndNamesByKinds(client, kinds, org) {
        return Q.try(() => {
            if (org === -1) {
                return db.selectAll(client, "select name, types, argnames, required, is_input, channel_type, kind, kind_type from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id "
                                    + " and dsc.version = ds.developer_version where ds.kind in (?)",
                                    [kinds]);
            } else if (org !== null) {
                return db.selectAll(client, "select name, types, argnames, required, is_input, channel_type, kind, kind_type from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id "
                                    + " and ((dsc.version = ds.developer_version and ds.owner = ?) or "
                                    + " (dsc.version = ds.approved_version and ds.owner <> ?)) where ds.kind"
                                    + " in (?) ",
                                    [org, org, kinds]);
            } else {
                return db.selectAll(client, "select name, types, argnames, required, is_input, channel_type, kind, kind_type from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id "
                                    + " and dsc.version = ds.approved_version where ds.kind in (?)",
                                    [kinds]);
            }
        }).then(processTypeRows);
    },

    getMetasByKinds(client, kinds, org, language) {
        return Q.try(() => {
            if (org === -1) {
                return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, confirmation_remote, doc, types,"
                                    + " argnames, argcanonicals, required, is_input, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                    + " approved_version from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                    + " and dsc.version = ds.developer_version "
                                    + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                    + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind in (?)",
                                    [language, kinds]);
            } if (org !== null) {
                return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, confirmation_remote, doc, types,"
                                    + " argnames, argcanonicals, required, is_input, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                    + " approved_version from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                    + " and ((dsc.version = ds.developer_version and ds.owner = ?) or"
                                    + " (dsc.version = ds.approved_version and ds.owner <> ?)) "
                                    + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                    + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind in (?) ",
                                    [org, org, language, kinds]);
            } else {
                return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, confirmation_remote, doc, types,"
                                    + " argnames, argcanonicals, required, is_input, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                    + " approved_version from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                    + " and dsc.version = ds.approved_version "
                                    + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                    + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind in (?)",
                                    [language, kinds]);
            }
        }).then(processMetaRows);
    },

    getMetasByKindAtVersion(client, kind, version, language) {
        return Q.try(() => {
            return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, confirmation_remote, doc, types,"
                                + " argnames, argcanonicals, required, is_input, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                + " approved_version from device_schema ds"
                                + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                + " and dsc.version = ? "
                                + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind = ?",
                                [version, language, kind]);
        }).then(processMetaRows);
    },

    getDeveloperMetas(client, kinds, language) {
        return Q.try(() => {
            return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, confirmation_remote, doc, types,"
                                + " argnames, argcanonicals, required, is_input, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                + " approved_version from device_schema ds"
                                + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                + " and dsc.version = ds.developer_version "
                                + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind in (?) ",
                                [language, kinds]);
        }).then(processMetaRows);
    },

    isKindTranslated(client, kind, language) {
        return db.selectOne(client, " select"
            + " (select count(*) from device_schema_channel_canonicals, device_schema"
            + " where language = 'en' and id = schema_id and version = developer_version"
            + " and kind = ?) as english_count, (select count(*) from "
            + "device_schema_channel_canonicals, device_schema where language = ? and "
            + "version = developer_version and id = schema_id and kind = ?) as translated_count",
            [kind, language, kind]).then((row) => {
                return row.english_count <= row.translated_count;
            });
    },

    create,
    update,
    delete(client, id) {
        return db.query(client, "delete from device_schema where id = ?", [id]);
    },
    deleteByKind(client, kind) {
        return db.query(client, "delete from device_schema where kind = ?", [kind]);
    },

    approve(client, id) {
        return db.query(client, "update device_schema set approved_version = developer_version where id = ?", [id]);
    },

    approveByKind(dbClient, kind) {
        return db.query(dbClient, "update device_schema set approved_version = developer_version where kind = ?", [kind]);
    },
    unapproveByKind(dbClient, kind) {
        return db.query(dbClient, "update device_schema set approved_version = null where kind = ?", [kind]);
    },

    insertChannels,
    insertTranslations
};
