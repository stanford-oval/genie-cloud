// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function insertTranslations(dbClient, schemaId, version, language, translations) {
    var channelCanonicals = [];
    var argobjects = [];

    for (var name in translations) {
        var meta = translations[name];
        var canonical = meta.canonical;
        var confirmation = meta.confirmation;
        var questions = meta.questions;
        var types = meta.schema;
        var argnames = meta.args || types.map((t, i) => 'arg' + (i+1));
        var required = meta.required;
        var argcanonicals = meta.argcanonicals;
        var keywords = ''; // for now

        channelCanonicals.push([schemaId, version, language, name, canonical, confirmation,
                                JSON.stringify(argcanonicals), JSON.stringify(questions),
                                keywords]);
        argnames.forEach(function(argname, i) {
            var argtype = types[i];
            var argrequired = required[i] || false;
            var argcanonical = argcanonicals[i];
            argobjects.push([argname, argtype, argrequired, schemaId, version, language, name, argcanonical]);
        });
    }

    if (channelCanonicals.length === 0)
        return Q();

    return db.insertOne(dbClient, 'replace into device_schema_channel_canonicals(schema_id, version, language, name, '
            + 'canonical, confirmation, argcanonicals, questions, keywords) values ?', [channelCanonicals]).then(() => {
            if (argobjects.length > 0)
                return db.insertOne(dbClient, 'replace into device_schema_arguments(argname, argtype, required, schema_id, version, '
                + 'language, channel_name, canonical) values ?', [argobjects]);
        });
}

function insertChannels(dbClient, schemaId, schemaKind, version, language, types, meta) {
    var channels = [];
    var channelCanonicals = [];
    var argobjects = [];

    function makeList(what, from, fromMeta) {
        for (var name in from) {
            var meta = fromMeta[name];
            // convert security-camera to 'security camera' and googleDrive to 'google drive'
            var kindCanonical = schemaKind.replace(/[_\-]/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
            var canonical = meta && meta.canonical ? (meta.canonical + ' on ' + kindCanonical) : null;
            var confirmation = (meta ? (meta.confirmation || meta.label) : null) || null;
            var types = from[name];
            var argnames = meta ? meta.args : types.map((t, i) => 'arg' + (i+1));
            var argcanonicals = argnames.map(function(argname) {
                // convert from_channel to 'from channel' and inReplyTo to 'in reply to'
                return argname.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
            });
            var questions = (meta ? meta.questions : null) || [];
            var required = (meta ? meta.required : null) || [];
            var doc = meta ? meta.doc : '';
            var keywords = ''; // for now
            channels.push([schemaId, version, name, what, doc,
                           JSON.stringify(types), JSON.stringify(argnames), JSON.stringify(required)]);
            channelCanonicals.push([schemaId, version, language, name, canonical, confirmation,
                                    JSON.stringify(argcanonicals), JSON.stringify(questions), keywords]);

            argnames.forEach(function(argname, i) {
                var argtype = types[i];
                var argcanonical = argcanonicals[i];
                var argrequired = required[i] || false;

                argobjects.push([argname, argtype, argrequired, schemaId, version, language, name, argcanonical]);
            });
        }
    }

    makeList('trigger', types[0], meta[0] || {});
    makeList('action', types[1], meta[1] || {});
    makeList('query', types[2] || {}, meta[2] || {});

    if (channels.length === 0)
        return;

    return db.insertOne(dbClient, 'insert into device_schema_channels(schema_id, version, name, '
        + 'channel_type, doc, types, argnames, required) values ?', [channels])
        .then(() => {
            return db.insertOne(dbClient, 'insert into device_schema_channel_canonicals(schema_id, version, language, name, '
            + 'canonical, confirmation, argcanonicals, questions, keywords) values ?', [channelCanonicals]);
        }).then(() => {
            if (argobjects.length > 0)
                return db.insertOne(dbClient, 'insert into device_schema_arguments(argname, argtype, required, schema_id, version, '
                + 'language, channel_name, canonical) values ?', [argobjects]);
        });
}

function create(client, schema, types, meta) {
    var KEYS = ['kind', 'kind_canonical', 'kind_type', 'owner', 'approved_version', 'developer_version'];
    KEYS.forEach(function(key) {
        if (schema[key] === undefined)
            schema[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return schema[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into device_schema(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals)
        .then(function(id) {
            schema.id = id;
        }).then(function() {
            return db.insertOne(client, 'insert into device_schema_version(schema_id, version, types, meta) '
                                + 'values(?, ?, ?, ?)', [schema.id, schema.developer_version,
                                                         JSON.stringify(types),
                                                         JSON.stringify(meta)]);
        }).then(function() {
            return insertChannels(client, schema.id, schema.kind, schema.developer_version, 'en', types, meta);
        }).then(function() {
            return schema;
        });
}

function update(client, id, kind, schema, types, meta) {
    return db.query(client, "update device_schema set ? where id = ?", [schema, id])
        .then(function() {
            return db.insertOne(client, 'insert into device_schema_version(schema_id, version, types, meta) '
                                + 'values(?, ?, ?, ?)', [id, schema.developer_version,
                                                         JSON.stringify(types),
                                                         JSON.stringify(meta)]);
        }).then(function() {
            return insertChannels(client, id, kind, schema.developer_version, 'en', types, meta);
        }).then(function() {
            return schema;
        });
}

function processMetaRows(rows) {
    var out = [];
    var current = null;
    rows.forEach(function(row) {
        if (current == null || current.kind !== row.kind) {
            current = {
                id: row.id,
                kind: row.kind,
                kind_type: row.kind_type,
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
            confirmation: row.confirmation || row.doc,
            doc: row.doc,
            canonical: row.canonical || '',
            argcanonicals: JSON.parse(row.argcanonicals) || [],
            questions: JSON.parse(row.questions) || [],
            required: JSON.parse(row.required)
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

module.exports = {
    get: function(client, id) {
        return db.selectOne(client, "select * from device_schema where id = ?", [id]);
    },

    getAll: function(client, id) {
        return db.selectAll(client, "select types, meta, ds.* from device_schema ds, "
                            + "device_schema_version dsv where ds.id = dsv.schema_id "
                            + "and ds.developer_version = dsv.version order by id");
    },

    getAllForList: function(client, id) {
        return db.selectAll(client, "select * from device_schema where kind_type <> 'primary' order by kind_type desc, kind asc");
    },

    getByKind: function(client, kind) {
        return db.selectOne(client, "select * from device_schema where kind = ?", [kind]);
    },

    getTypesByKinds: function(client, kinds, org) {
        return Q.try(function() {
            if (org !== null) {
                return db.selectAll(client, "select name, types, channel_type, kind, kind_type from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id "
                                    + " and ((dsc.version = ds.developer_version and ds.owner = ?) or "
                                    + " (dsc.version = ds.approved_version and ds.owner <> ?)) where ds.kind"
                                    + " in (?) ",
                                    [org, org, kinds]);
            } else {
                return db.selectAll(client, "select name, types, channel_type, kind, kind_type from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id "
                                    + " and dsc.version = ds.approved_version where ds.kind in (?)",
                                    [kinds]);
            }
        }).then(function(rows) {
            var out = [];
            var current = null;
            rows.forEach(function(row) {
                if (current == null || current.kind !== row.kind) {
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
                var types = JSON.parse(row.types);
                switch (row.channel_type) {
                case 'action':
                    current.actions[row.name] = types;
                    break;
                case 'trigger':
                    current.triggers[row.name] = types;
                    break;
                case 'query':
                    current.queries[row.name] = types;
                    break;
                default:
                    throw new TypeError();
                }
            });
            return out;
        });
    },

    getTypesAndMeta: function(client, id, version) {
        return db.selectOne(client, "select types, meta from device_schema_version "
            + "where schema_id = ? and version = ?", [id, version]);
    },

    getMetasByKinds: function(client, kinds, org, language) {
        return Q.try(function() {
            if (org !== null) {
                return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, doc, types,"
                                    + " argnames, argcanonicals, required, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                    + " approved_version from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                    + " and ((dsc.version = ds.developer_version and ds.owner = ?) or"
                                    + " (dsc.version = ds.approved_version and ds.owner <> ?)) "
                                    + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                    + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind in (?) ",
                                    [org, org, language, kinds]);
            } else {
                return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, doc, types,"
                                    + " argnames, argcanonicals, required, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                    + " approved_version from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                    + " and dsc.version = ds.approved_version "
                                    + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                    + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind in (?)",
                                    [language, kinds]);
            }
        }).then(function(rows) {
            return processMetaRows(rows);
        });
    },

    getMetasByKindAtVersion: function(client, kind, version, language) {
        return Q.try(function() {
            return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, doc, types,"
                                + " argnames, argcanonicals, required, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                + " approved_version from device_schema ds"
                                + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                + " and dsc.version = ? "
                                + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind = ?",
                                [version, language, kind]);
        }).then(function(rows) {
            return processMetaRows(rows);
        });
    },

    getDeveloperMetas: function(client, kinds, language) {
        return Q.try(function() {
            return db.selectAll(client, "select dsc.name, channel_type, canonical, confirmation, doc, types,"
                                + " argnames, argcanonicals, required, questions, id, kind, kind_type, owner, dsc.version, developer_version,"
                                + " approved_version from device_schema ds"
                                + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                + " and dsc.version = ds.developer_version "
                                + " left join device_schema_channel_canonicals dscc on dscc.schema_id = dsc.schema_id and "
                                + " dscc.version = dsc.version and dscc.name = dsc.name and dscc.language = ? where ds.kind in (?) ",
                                [language, kinds]);
        }).then(function(rows) {
            return processMetaRows(rows);
        });
    },

    isKindTranslated: function(client, kind, language) {
        return db.selectOne(client, " select"
            + " (select count(*) from device_schema_channel_canonicals, device_schema"
            + " where language = 'en' and id = schema_id and version = developer_version"
            + " and kind = ?) as english_count, (select count(*) from "
            + "device_schema_channel_canonicals, device_schema where language = ? and "
            + "version = developer_version and id = schema_id and kind = ?) as translated_count",
            [kind, language, kind]).then(function(row) {
                return row.english_count <= row.translated_count;
            });
    },

    create: create,
    update: update,
    delete: function(client, id) {
        return db.query(client, "delete from device_schema where id = ?", [id]);
    },

    approve: function(client, id) {
        return db.query(client, "update device_schema set approved_version = developer_version where id = ?", [id]);
    },

    approveByKind: function(dbClient, kind) {
        return db.query(dbClient, "update device_schema set approved_version = developer_version where kind = ?", [kind]);
    },

    insertChannels: insertChannels,
    insertTranslations: insertTranslations
};
