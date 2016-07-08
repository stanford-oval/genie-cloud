// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function insertChannels(dbClient, schemaId, schemaKind, version, types, meta) {
    var channels = [];
    var argobjects = [];

    function makeList(what, from, fromMeta) {
        for (var name in from) {
            var meta = fromMeta[name];
            var canonical = meta && meta.canonical ? (meta.canonical + ' on ' + schemaKind) : null;
            var confirmation = (meta ? (meta.confirmation || meta.label) : null) || null;
            var types = from[name];
            var argnames = meta ? meta.args : types.map((t, i) => 'arg' + (i+1));
            var questions = (meta ? meta.questions : null) || [];
            var required = (meta ? meta.required : null) || [];
            var doc = meta ? meta.doc : '';
            channels.push([schemaId, version, name, what, canonical, confirmation, doc,
                           JSON.stringify(types), JSON.stringify(argnames), JSON.stringify(required),
                           JSON.stringify(questions)]);

            argnames.forEach(function(argname, i) {
                var argtype = types[i];
                var argrequired = required[i] || false;

                // convert from_channel to 'from channel' and inReplyTo to 'in reply to'
                var canonical = argname.replace('_', ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
                argobjects.push([argname, argtype, argrequired, schemaId, version, name, canonical]);
            });
        }
    }

    makeList('trigger', types[0], meta[0] || {});
    makeList('action', types[1], meta[1] || {});
    makeList('query', types[2] || {}, meta[2] || {});

    if (channels.length === 0)
        return;

    return db.insertOne(dbClient, 'insert into device_schema_channels(schema_id, version, name, '
        + 'channel_type, canonical, confirmation, doc, types, argnames, required, questions) values ?', [channels])
        .then(() => {
            if (argobjects.length > 0)
                return db.insertOne(dbClient, 'insert into device_schema_arguments(argname, argtype, required, schema_id, version, '
                + 'channel_name, canonical) values ?', [argobjects]);
        });
}

function create(client, schema, types, meta) {
    var KEYS = ['kind', 'kind_type', 'owner', 'approved_version', 'developer_version'];
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
            return insertChannels(client, schema.id, schema.kind, schema.developer_version, types, meta);
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
            return insertChannels(client, id, kind, schema.developer_version, types, meta);
        }).then(function() {
            return schema;
        });
}

module.exports = {
    get: function(client, id) {
        return db.selectOne(client, "select * from device_schema where id = ?", [id]);
    },

    getAll: function(client, id) {
        return db.selectAll(client, "select types, meta, ds.* from device_schema ds, "
                            + "device_schema_version dsv where ds.id = dsv.schema_id "
                            + "and ds.developer_version = dsv.version");
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

    getMetasByKinds: function(client, kinds, org) {
        return Q.try(function() {
            if (org !== null) {
                return db.selectAll(client, "select name, channel_type, canonical, confirmation, doc, types,"
                                    + " argnames, required, questions, id, kind, kind_type, owner, developer_version,"
                                    + " approved_version from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                    + " and ((dsc.version = ds.developer_version and ds.owner = ?) or"
                                    + " (dsc.version = ds.approved_version and ds.owner <> ?)) where ds.kind"
                                    + " in (?) ",
                                    [org, org, kinds]);
            } else {
                return db.selectAll(client, "select name, channel_type, canonical, confirmation, doc, types,"
                                    + " argnames, required, questions, id, kind, kind_type, owner, developer_version,"
                                    + " approved_version from device_schema ds"
                                    + " left join device_schema_channels dsc on ds.id = dsc.schema_id"
                                    + " and dsc.version = ds.approved_version where ds.kind in (?)",
                                    [kinds]);
            }
        }).then(function(rows) {
            var out = [];
            var current = null;
            rows.forEach(function(row) {
                if (current == null || current.kind !== row.kind) {
                    current = {
                        id: row.id,
                        kind: row.kind,
                        kind_type: row.kind_type,
                        owner: row.owner,
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
                    confirmation: row.confirmation,
                    doc: row.doc,
                    canonical: row.canonical,
                    questions: JSON.parse(row.questions),
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

    insertChannels: insertChannels
};
