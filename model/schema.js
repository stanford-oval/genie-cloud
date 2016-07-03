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

    function makeList(what, from, fromMeta) {
        for (var name in from) {
            var meta = fromMeta[name];
            var canonical = meta && meta.canonical ? (meta.canonical + ' on ' + schemaKind) : null;
            var confirmation = (meta ? (meta.confirmation || meta.label) : null) || null;
            var types = from[name];
            var argnames = meta ? meta.args : types.map((t, i) => 'arg' + (i+1));
            var questions = (meta ? meta.questions : null) || [];
            channels.push([schemaId, version, name, what, canonical, confirmation,
                           JSON.stringify(types), JSON.stringify(argnames),
                           JSON.stringify(questions)]);
        }
    }

    makeList('trigger', types[0], meta[0] || {});
    makeList('action', types[1], meta[1] || {});
    makeList('query', types[2] || {}, meta[2] || {});

    if (channels.length === 0)
        return;

    return db.insertOne(dbClient, 'insert into device_schema_channels(schema_id, version, name, '
        + 'channel_type, canonical, confirmation, types, argnames, questions) values ?', [channels]);
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
                return db.selectAll(client, "select name, types, channel_type, ds.* from device_schema ds, "
                                    + "device_schema_channels dsc where ds.id = dsc.schema_id and ds.kind"
                                    + " in (?) and ((dsc.version = ds.developer_version and ds.owner = ?) or "
                                    + " (dsc.version = ds.approved_version and ds.owner <> ?))",
                                    [kinds, org.id, org.id]);
            } else {
                return db.selectAll(client, "select name, types, channel_type, ds.* from device_schema ds, "
                                    + "device_schema_channels dsc where ds.id = dsc.schema_id and ds.kind"
                                    + " in (?) and dsc.version = ds.approved_version",
                                    [kinds]);
            }
        }).then(function(rows) {
            var out = [];
            var current = null;
            rows.forEach(function(row) {
                if (current == null || current.kind !== row.kind) {
                    current = {};
                    for (var name in row) {
                        if (name === 'name' || name === 'types' || name === 'channel_type')
                            continue;
                        current[name] = row[name];
                    }
                    current.triggers = {};
                    current.queries = {};
                    current.actions = {};
                    out.push(current);
                }
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

    getMetasByKinds: function(client, kinds, org) {
        return Q.try(function() {
            if (org !== null) {
                return db.selectAll(client, "select types, meta, ds.* from device_schema ds, "
                                    + "device_schema_version dsv where ds.id = dsv.schema_id and ds.kind"
                                    + " in (?) and ((dsv.version = ds.developer_version and ds.owner = ?) or "
                                    + " (dsv.version = ds.approved_version and ds.owner <> ?))",
                                    [kinds, org.id, org.id]);
            } else {
                return db.selectAll(client, "select types, meta, ds.* from device_schema ds, "
                                    + "device_schema_version dsv where ds.id = dsv.schema_id and ds.kind"
                                    + " in (?) and dsv.version = ds.approved_version",
                                    [kinds]);
            }
        }).then(function(rows) {
            rows.forEach(function(row) {
                try {
                    row.types = JSON.parse(row.types);
                    row.meta = JSON.parse(row.meta);
                } catch(e) {
                    console.error("Failed to parse types in " + row.kind);
                    row.types = null;
                    row.meta = null;
                }
            });
            return rows;
        });
    },

    create: create,
    update: update,

    approveByKind: function(dbClient, kind) {
        return db.query(client, "update device_schema set approved_version = developer_version where kind = ?", [kind]);
    },

    insertChannels: insertChannels
};
