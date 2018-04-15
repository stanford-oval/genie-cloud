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

function insertKinds(client, deviceId, extraKinds, extraChildKinds) {
    const extraValues = [];
    for (let k of extraKinds)
        extraValues.push([deviceId, k, false]);
    for (let k of extraChildKinds)
        extraValues.push([deviceId, k, true]);
    if (extraValues.length === 0)
        return Promise.resolve();

    return db.query(client, 'insert into device_class_kind(device_id, kind, is_child) values ?',
                    [extraValues]);
}

function create(client, device, extraKinds, extraChildKinds, code) {
    var KEYS = ['primary_kind', 'owner', 'name', 'description', 'fullcode', 'module_type',
                'category', 'subcategory', 'approved_version', 'developer_version'];
    KEYS.forEach((key) => {
        if (device[key] === undefined)
            device[key] = null;
    });
    var vals = KEYS.map((key) => device[key]);
    var marks = KEYS.map(() => '?');

    return db.insertOne(client, 'insert into device_class(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then((id) => {
        device.id = id;

        return insertKinds(client, device.id, extraKinds, extraChildKinds);
    }).then(() => {
        return db.insertOne(client, 'insert into device_code_version(device_id, version, code) '
                            + 'values(?, ?, ?)', [device.id, device.developer_version, code]);
    }).then(() => device);
}

function update(client, id, device, extraKinds, extraChildKinds, code) {
    return db.query(client, "update device_class set ? where id = ?", [device, id]).then(() => {
        return db.query(client, "delete from device_class_kind where device_id = ?", [id]);
    }).then(() => {
        return insertKinds(client, id, extraKinds, extraChildKinds);
    }).then(() => {
        return db.insertOne(client, 'insert into device_code_version(device_id, version, code) '
                            + 'values(?, ?, ?)', [id, device.developer_version, code]);
    })
    .then(() => device);
}

module.exports = {
    get(client, id) {
        return db.selectOne(client, "select * from device_class where id = ?", [id]);
    },

    getByOwner(client, owner) {
        return db.selectAll(client, "select * from device_class where owner = ? order by name asc", [owner]);
    },

    getFullCodeByPrimaryKind(client, kind, org) {
        if (org !== null && org.is_admin) {
            return db.selectAll(client, "select fullcode, code, version, approved_version from device_code_version dcv, device_class d "
                                + "where d.primary_kind = ? and dcv.device_id = d.id "
                                + "and dcv.version = d.developer_version", [kind]);
        } else if (org !== null) {
            return db.selectAll(client, "select fullcode, code, version, approved_version from device_code_version dcv, device_class d "
                                + "where d.primary_kind = ? and dcv.device_id = d.id "
                                + "and ((dcv.version = d.developer_version and d.owner = ?) "
                                + "or (dcv.version = d.approved_version and d.owner <> ?))",
                                [kind, org.id, org.id]);
        } else {
            return db.selectAll(client, "select fullcode, code, version, approved_version from device_code_version dcv, device_class d "
                                + "where d.primary_kind = ? and dcv.device_id = d.id "
                                + "and dcv.version = d.approved_version", [kind]);
        }
    },

    getByFuzzySearch(client, tag) {
        var pctag = '%' + tag + '%';
        return db.selectAll(client, "(select 0 as weight, d.* from device_class d where primary_kind = ?) union "
                                + " (select 1, d.* from device_class d where name like ? or description like ?)"
                                + " union "
                                + " (select 2, d.* from device_class d, device_class_kind dk "
                                + " where dk.device_id = d.id and dk.kind = ?)"
                                + " order by weight asc, name asc limit 20",
                                [tag, pctag, pctag, tag]);
    },

    getCodeByVersion(client, id, version) {
        return db.selectOne(client, "select code from device_code_version where device_id = ? and version = ?",
            [id, version]);
    },

    getByPrimaryKind(client, kind) {
        return db.selectOne(client, "select * from device_class where primary_kind = ?", [kind]);
    },

    getByAnyKind(client, kind) {
        return db.selectAll(client, "select * from device_class where primary_kind = ? union "
                            + "(select d.* from device_class d, device_class_kind dk "
                            + "where dk.device_id = d.id and dk.kind = ? and not dk.is_child)", [kind, kind]);
    },

    getByCategory(client, category, org) {
        if (org !== null && org.is_admin) {
            return db.selectAll(client, "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and category = ? "
                + "and d.developer_version = dcv.version order by name", [category]);
        } else if (org !== null) {
            return db.selectAll(client, "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "((dcv.version = d.developer_version and d.owner = ?) or "
                + " (dcv.version = d.approved_version and d.owner <> ?)) "
                + "and category = ? order by name", [org.id, org.id, category]);
        } else {
            return db.selectAll(client, "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "dcv.version = d.approved_version and category = ? order by name", [category]);
        }
    },

    getBySubcategory(client, category, org) {
        if (org !== null && org.is_admin) {
            return db.selectAll(client, "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and subcategory = ? "
                + "and d.developer_version = dcv.version order by name", [category]);
        } else if (org !== null) {
            return db.selectAll(client, "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "((dcv.version = d.developer_version and d.owner = ?) or "
                + " (dcv.version = d.approved_version and d.owner <> ?)) "
                + "and subcategory = ? order by name", [org.id, org.id, category]);
        } else {
            return db.selectAll(client, "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "dcv.version = d.approved_version and subcategory = ? order by name", [category]);
        }
    },

    getByTag(client, tag) {
        return db.selectAll(client, "select dc.* from device_class dc, device_class_tag dct "
                            + "where dct.device_id = dc.id and dct.tag = ? order by dc.name", [tag]);
    },

    getAllKinds(client, id) {
        return db.selectAll(client, "select * from device_class_kind where device_id = ? "
                            + "order by kind", [id]);
    },

    create,
    update,
    delete(client, id) {
        return db.query(client, "delete from device_class where id = ?", [id]);
    },

    approve(client, id) {
        return db.query(client, "update device_class set approved_version = developer_version where id = ?", [id]);
    },
    unapprove(client, id) {
        return db.query(client, "update device_class set approved_version = null where id = ?", [id]);
    },

    getAll(client, start, end) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, "select * from device_class order by name limit ?,?",
                                [start, end]);
        } else {
            return db.selectAll(client, "select * from device_class order by name");
        }
    },

    getAllApproved(client, start, end, org) {
        if (org !== null) {
            if (start !== undefined && end !== undefined) {
                return db.selectAll(client, "select * from device_class where (approved_version is not null or owner = ?) order by name limit ?,?",
                                    [org, start, end]);
            } else {
                return db.selectAll(client, "select * from device_class where (approved_version is not null or owner = ?) order by name", [org]);
            }
        } else {
            if (start !== undefined && end !== undefined) {
                return db.selectAll(client, "select * from device_class where approved_version is not null order by name limit ?,?",
                                    [start, end]);
            } else {
                return db.selectAll(client, "select * from device_class where approved_version is not null order by name");
            }
        }
    },

    getAllWithKindOrChildKind(client, kind, start, end) {
        var query = "select d.* from device_class d where exists (select 1 from device_class_kind "
            + "dk where dk.device_id = d.id and dk.kind = ?) order by d.name";
        if (start !== undefined && end !== undefined)
            return db.selectAll(client, query + " limit ?,?", [kind, start, end]);
        else
            return db.selectAll(client, query, [kind]);
    },

    getAllApprovedWithCode(client, org, start, end) {
        if (org !== null && org.is_admin) {
            const query = "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "dcv.version = d.developer_version order by d.name";
            if (start !== undefined && end !== undefined) {
                return db.selectAll(client, query + " limit ?,?",
                                    [start, end]);
            } else {
                return db.selectAll(client, query, []);
            }
        } else if (org !== null) {
            const query = "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "((dcv.version = d.developer_version and d.owner = ?) or "
                + " (dcv.version = d.approved_version and d.owner <> ?)) order by d.name";
            if (start !== undefined && end !== undefined) {
                return db.selectAll(client, query + " limit ?,?",
                                    [org.id, org.id, start, end]);
            } else {
                return db.selectAll(client, query, [org.id, org.id]);
            }
        } else {
            const query = "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "dcv.version = d.approved_version order by d.name";
            if (start !== undefined && end !== undefined) {
                return db.selectAll(client, query + " limit ?,?",
                                    [start, end]);
            } else {
                return db.selectAll(client, query, []);
            }
        }
    },

    getApprovedByKindsWithCode(client, names, org) {
        if (org !== null && org.is_admin) {
            const query = "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "dcv.version = d.developer_version and "
                + "d.primary_kind in (?)";
            return db.selectAll(client, query, [names]);
        } else if (org !== null) {
            const query = "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "((dcv.version = d.developer_version and d.owner = ?) or "
                + " (dcv.version = d.approved_version and d.owner <> ?)) and "
                + "d.primary_kind in (?)";
            return db.selectAll(client, query, [org.id, org.id, names]);
        } else {
            const query = "select d.*, dcv.code from device_class d, "
                + "device_code_version dcv where d.id = dcv.device_id and "
                + "dcv.version = d.approved_version and "
                + "d.primary_kind in (?)";
            return db.selectAll(client, query, [names]);
        }
    }
};