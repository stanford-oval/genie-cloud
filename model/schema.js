// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function create(client, schema, types, meta) {
    var KEYS = ['kind', 'approved_version', 'developer_version'];
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
                                + 'values(?, ?, ?)', [schema.id, schema.developer_version,
                                                      JSON.stringify(types),
                                                      JSON.stringify(meta)]);
        }).then(function() {
            return schema;
        });
}

function update(client, id, schema, types, meta) {
    return db.query(client, "update device_schema set ? where id = ?", [schema, id])
        .then(function() {
            return db.insertOne(client, 'insert into device_schema_version(schema_id, version, types) '
                                + 'values(?, ?, ?)', [id, schema.developer_version,
                                                      JSON.stringify(types),
                                                      JSON.stringify(meta)]);
        })
        .then(function() {
            return schema;
        });
}

module.exports = {
    get: function(client, id) {
        return db.selectOne(client, "select * from device_schema where id = ?", [id]);
    },

    getByKind: function(client, kind) {
        return db.selectOne(client, "select * from device_schema where kind = ?", [kind]);
    },

    getTypesByKinds: function(client, kinds, org) {
        // FIXME use organization
        return Q.try(function() {
            return db.selectAll(client, "select types, ds.* from device_schema ds, "
                                + "device_schema_version dsv where ds.id = dsv.schema_id and ds.kind"
                                + " in (?) and ds.approved_version = dsv.version",
                                [kinds]);
        }).then(function(rows) {
            rows.forEach(function(row) {
                try {
                    row.types = JSON.parse(row.types);
                } catch(e) {
                    console.error("Failed to parse types in " + row.kind);
                    row.types = null;
                }
            });
            return rows;
        });
    },

    getTypesByKind: function(client, kind) {
        return db.selectAll(client, "select types, ds.* from device_schema ds, "
                            + "device_schema_version dsv where ds.id = dsv.schema_id and ds.kind"
                            + " = ? and ds.developer_version = dsv.version",
                            [kind])
            .then(function(rows) {
                rows.forEach(function(row) {
                    try {
                        row.types = JSON.parse(row.types);
                    } catch(e) {
                        console.error("Failed to parse types in " + row.kind);
                        row.types = null;
                    }
                });
                return rows;
            });
    },

    getTypesAndMetaByKind: function(client, kind) {
        return db.selectAll(client, "select types, meta, ds.* from device_schema ds, "
                            + "device_schema_version dsv where ds.id = dsv.schema_id and ds.kind"
                            + " = ? and ds.developer_version = dsv.version",
                            [kind])
            .then(function(rows) {
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
};
