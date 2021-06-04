// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

function insertDiscoveryServices(client, deviceId, discoveryServices) {
    if (discoveryServices.length === 0)
        return Promise.resolve([]);

    return db.query(client, 'insert into device_discovery_services(device_id, discovery_type, service) values ?',
        [discoveryServices.map((ds) => [deviceId, ds.discovery_type, ds.service])]);
}

async function create(client, device, extraKinds, extraChildKinds, discoveryServices, versionedInfo) {
    device.id = await db.insertOne(client, 'insert into device_class set ?', [device]);
    versionedInfo.device_id = device.id;
    versionedInfo.version = device.developer_version;
    await Promise.all([
        insertKinds(client, device.id, extraKinds, extraChildKinds),
        insertDiscoveryServices(client, device.id, discoveryServices),
        db.insertOne(client, `insert into device_code_version set ?`, [versionedInfo])
    ]);
    return device;
}

async function update(client, id, device, extraKinds, extraChildKinds, discoveryServices, versionedInfo) {
    await Promise.all([
        db.query(client, "update device_class set ? where id = ?", [device, id]),
        db.query(client, "delete from device_class_kind where device_id = ?", [id]),
        db.query(client, "delete from device_discovery_services where device_id = ?", [id])
    ]);
    versionedInfo.device_id = id;
    versionedInfo.version = device.developer_version;
    await Promise.all([
        insertKinds(client, id, extraKinds, extraChildKinds),
        insertDiscoveryServices(client, id, discoveryServices),
        db.insertOne(client, 'insert into device_code_version set ?', [versionedInfo])
    ]);
    return device;
}

export async function get(client, id) {
    return db.selectOne(client, `select d.*, o.name as owner_name, o.id_hash as owner_id_hash
        from device_class d left join organizations o on o.id = d.owner where d.id = ?`, [id]);
}

export async function getByPrimaryKind(client, kind, includeSourceCode) {
    return db.selectOne(client, `select ${includeSourceCode ? 'd.source_code,' : ''}
        d.id,d.name,d.description,d.primary_kind,d.category,
        d.subcategory,d.developer_version,d.approved_version,
        d.website,d.repository,d.issue_tracker,d.license,d.license_gplcompatible,
        d.owner,o.name as owner_name, o.id_hash as owner_id_hash
        from device_class d left join organizations o on o.id = d.owner where primary_kind = ?`, [kind]);
}

export async function getNamesByKinds(client, kinds) {
    if (kinds.length === 0)
        return {};
    const rows = await db.selectAll(client, `select id,name,primary_kind from device_class where primary_kind in (?)`, [kinds]);
    const ret = {};
    for (const row of rows)
        ret[row.primary_kind] = row;
    return ret;
}

export async function getByOwner(client, owner) {
    return db.selectAll(client, "select id,name,primary_kind,owner from device_class where owner = ? order by name asc", [owner]);
}

export async function getFullCodeByPrimaryKind(client, kind, orgId) {
    if (orgId === -1) {
        return db.selectAll(client, "select code, version, approved_version, developer_version, primary_kind, name, description, "
                            + "category, subcategory, website, repository, issue_tracker, license from device_code_version dcv, device_class d "
                            + "where d.primary_kind = ? and dcv.device_id = d.id "
                            + "and dcv.version = d.developer_version", [kind]);
    } else if (orgId !== null) {
        return db.selectAll(client, "select code, version, approved_version, developer_version, primary_kind, name, description, "
                            + "category, subcategory, website, repository, issue_tracker, license from device_code_version dcv, device_class d "
                            + "where d.primary_kind = ? and dcv.device_id = d.id "
                            + "and ((dcv.version = d.developer_version and d.owner = ?) "
                            + "or (dcv.version = d.approved_version and d.owner <> ?))",
                            [kind, orgId, orgId]);
    } else {
        return db.selectAll(client, "select code, version, approved_version, developer_version, primary_kind, name, description, "
                            + "category, subcategory, website, repository, issue_tracker, license from device_code_version dcv, device_class d "
                            + "where d.primary_kind = ? and dcv.device_id = d.id "
                            + "and dcv.version = d.approved_version", [kind]);
    }
}

export async function getFullCodeByPrimaryKinds(client, kinds, orgId) {
    if (orgId === -1) {
        return db.selectAll(client, "select code, version, approved_version, developer_version, primary_kind, name, description, "
                            + "category, subcategory, website, repository, issue_tracker, license from device_code_version dcv, device_class d "
                            + "where d.primary_kind in (?) and dcv.device_id = d.id "
                            + "and dcv.version = d.developer_version", [kinds]);
    } else if (orgId !== null) {
        return db.selectAll(client, "select code, version, approved_version, developer_version, primary_kind, name, description, "
                            + "category, subcategory, website, repository, issue_tracker, license from device_code_version dcv, device_class d "
                            + "where d.primary_kind in (?) and dcv.device_id = d.id "
                            + "and ((dcv.version = d.developer_version and d.owner = ?) "
                            + "or (dcv.version = d.approved_version and d.owner <> ?))",
                            [kinds, orgId, orgId]);
    } else {
        return db.selectAll(client, "select code, version, approved_version, developer_version, primary_kind, name, description, "
                            + "category, subcategory, website, repository, issue_tracker, license from device_code_version dcv, device_class d "
                            + "where d.primary_kind in (?) and dcv.device_id = d.id "
                            + "and dcv.version = d.approved_version", [kinds]);
    }
}

export async function getByFuzzySearch(client, tag, org) {
    const pctag = '%' + tag + '%';

    if (org !== null && org.is_admin) {
        return db.selectAll(client,
            `select
                primary_kind, name, description, category,
                website, repository, issue_tracker, license,
                subcategory from device_class where primary_kind = ?
                or name like ? or description like ?
                or id in (select device_id from device_class_kind where kind = ?)
                order by name asc limit 20`,
            [tag, pctag, pctag, tag]);
    } else if (org !== null) {
        return db.selectAll(client,
            `select primary_kind, name, description, category,
                website, repository, issue_tracker, license,
                subcategory from device_class where (primary_kind = ?
                or name like ? or description like ?
                or id in (select device_id from device_class_kind where kind = ?))
                and (approved_version is not null or owner = ?)
                order by name asc limit 20`,
            [tag, pctag, pctag, tag, org.id]);
    } else {
        return db.selectAll(client,
            `select primary_kind, name, description, category,
                website, repository, issue_tracker, license,
                subcategory from device_class where (primary_kind = ?
                or name like ? or description like ?
                or id in (select device_id from device_class_kind where kind = ?))
                and approved_version is not null
                order by name asc limit 20`,
            [tag, pctag, pctag, tag]);
    }
}

export async function getCodeByVersion(client, id, version) {
    return db.selectOne(client, "select code from device_code_version where device_id = ? and version = ?",
        [id, version]).then((row) => row.code);
}

export async function getByAnyKind(client, kind) {
    return db.selectAll(client, `
        (select d.id,d.name,d.description,d.primary_kind,d.category,
            d.subcategory,d.developer_version,d.approved_version,d.owner from device_class
            where primary_kind = ?)
        union
        (select d.id,d.name,d.description,d.primary_kind,d.category,
        d.subcategory,d.developer_version,d.approved_version,d.owner from device_class d,
        device_class_kind dk where dk.device_id = d.id and dk.kind = ? and not dk.is_child)`,
        [kind, kind]);
}

export async function getByDiscoveryService(client, discoveryType, service) {
    return db.selectAll(client, `select d.id,d.name,d.description,d.primary_kind,d.category,
        d.subcategory,d.developer_version,d.approved_version,d.owner from device_class d,
        device_discovery_services dds where dds.device_id = d.id and dds.discovery_type = ?
        and dds.service = ?`,
        [discoveryType, service]);
}

export async function getByCategoryWithCode(client, category, org) {
    if (org !== null && org.is_admin) {
        return db.selectAll(client, "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and category = ? "
            + "and d.developer_version = dcv.version order by name", [category]);
    } else if (org !== null) {
        return db.selectAll(client, "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and "
            + "((dcv.version = d.developer_version and d.owner = ?) or "
            + " (dcv.version = d.approved_version and d.owner <> ?)) "
            + "and category = ? order by name", [org.id, org.id, category]);
    } else {
        return db.selectAll(client, "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and "
            + "dcv.version = d.approved_version and category = ? order by name", [category]);
    }
}

export async function getBySubcategoryWithCode(client, category, org) {
    if (org !== null && org.is_admin) {
        return db.selectAll(client, "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and subcategory = ? "
            + "and d.developer_version = dcv.version order by name", [category]);
    } else if (org !== null) {
        return db.selectAll(client, "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and "
            + "((dcv.version = d.developer_version and d.owner = ?) or "
            + " (dcv.version = d.approved_version and d.owner <> ?)) "
            + "and subcategory = ? order by name", [org.id, org.id, category]);
    } else {
        return db.selectAll(client, "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and "
            + "dcv.version = d.approved_version and subcategory = ? order by name", [category]);
    }
}

export async function getAllApprovedWithCode(client, org, start, end) {
    if (org !== null && org.is_admin) {
        const query = "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and "
            + "dcv.version = d.developer_version order by d.name";
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, query + " limit ?,?",
                                [start, end]);
        } else {
            return db.selectAll(client, query, []);
        }
    } else if (org !== null) {
        const query = "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
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
        const query = "select d.primary_kind, d.category, d.name, dcv.code, dcv.factory from device_class d, "
            + "device_code_version dcv where d.id = dcv.device_id and "
            + "dcv.version = d.approved_version order by d.name";
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, query + " limit ?,?",
                                [start, end]);
        } else {
            return db.selectAll(client, query, []);
        }
    }
}

async function _getByField(client, field, value, org, start, end) {
    if (org !== null && org.is_admin) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class where ${field} = ? order by name limit ?,?`,
                [value, start, end]);
        } else {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class where ${field} = ? order by name`,
                [value]);
        }
    } else if (org !== null) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where (approved_version is not null or owner = ?) and ${field} = ?
                order by name limit ?,?`,
                [org.id, value, start, end]);
        } else {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where (approved_version is not null or owner = ?) and ${field} = ?
                order by name`,
                [org.id, value]);
        }
    } else {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where approved_version is not null and ${field} = ?
                order by name limit ?,?`,
                [value, start, end]);
        } else {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where approved_version is not null and ${field} = ?
                order by name`, [value]);
        }
    }
}

export async function getByCategory(client, category, org, start, end) {
    return _getByField(client, 'category', category, org, start, end);
}

export async function getBySubcategory(client, category, org, start, end) {
    return _getByField(client, 'subcategory', category, org, start, end);
}

export async function getDownloadVersion(client, kind, org) {
    if (org !== null && org.is_admin) {
        return db.selectOne(client, `select downloadable, owner, approved_version, version from
            device_class, device_code_version where device_id = id and version = developer_version
            and primary_kind = ?`, [kind]);
    } else if (org !== null) {
        return db.selectOne(client, `select downloadable, owner, approved_version, version from
            device_class, device_code_version where device_id = id and
            ((version = developer_version and owner = ?) or
                (version = approved_version and owner <> ?))
            and primary_kind = ?`, [org.id, org.id, kind]);
    } else {
        return db.selectOne(client, `select downloadable, owner, approved_version, version from
            device_class, device_code_version where device_id = id and version = approved_version
            and primary_kind = ?`, [kind]);
    }
}

export async function getAllApprovedByOwner(client, owner) {
    return db.selectAll(client, `select primary_kind, name, description,
        website, repository, issue_tracker, license,
        category, subcategory from device_class
        where approved_version is not null and owner = ? order by name`, [owner]);
}

export async function getAllApproved(client, org, start, end) {
    if (org !== null && org.is_admin) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                order by name limit ?,?`,
                [start, end]);
        } else {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class order by name`);
        }
    } else if (org !== null) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where (approved_version is not null or owner = ?)
                order by name limit ?,?`,
                [org.id, start, end]);
        } else {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where (approved_version is not null or owner = ?)
                order by name`, [org.id]);
        }
    } else {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, `select primary_kind, name, description,
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where approved_version is not null
                order by name limit ?,?`,
                [start, end]);
        } else {
            return db.selectAll(client, `select primary_kind, name, description,
                category, subcategory from device_class
                where approved_version is not null order by name`);
        }
    }
}

export async function getAllKinds(client, id) {
    return db.selectAll(client, "select * from device_class_kind where device_id = ? "
                        + "order by kind", [id]);
}
export async function getAllDiscoveryServices(client, id) {
    return db.selectAll(client, "select * from device_discovery_services where device_id = ?", [id]);
}

export {
    create,
    update,
};
async function _delete(client, id) {
    return db.query(client, "delete from device_class where id = ?", [id]);
}
export { _delete as delete };

export async function approve(client, kind) {
    return db.query(client, "update device_class set approved_version = developer_version where primary_kind = ?", [kind]);
}
export async function unapprove(client, kind) {
    return db.query(client, "update device_class set approved_version = null where primary_kind = ?", [kind]);
}

export async function getFeatured(client, count = 6) {
    return db.selectAll(client, `select d.id,d.name,d.primary_kind from device_class d, device_class_tag dt, device_code_version dcv
        where dt.device_id = d.id and dt.tag = 'featured' and d.approved_version = dcv.version and dcv.device_id = d.id
        order by mtime desc limit ?`,
        [count]);
}

export async function getReviewQueue(client, start, end) {
    if (start !== undefined && end !== undefined) {
        return db.selectAll(client, `select d.id,d.primary_kind,d.name,d.approved_version,d.developer_version,
            d.owner,org.name as owner_name, app_dcv.mtime as approval_time, dev_dcv.mtime as last_modified from
            (device_class d, organizations org, device_code_version dev_dcv) left join
            device_code_version app_dcv on d.id = app_dcv.device_id and d.approved_version = app_dcv.version
            where org.id = d.owner and (d.approved_version is null or d.approved_version != d.developer_version)
            and dev_dcv.version = d.developer_version and dev_dcv.device_id = d.id order by last_modified desc
            limit ?,?`,
            [start, end]);
    } else {
        return db.selectAll(client, `select d.id,d.primary_kind,d.name,d.approved_version,d.developer_version,
            d.owner,org.name as owner_name, app_dcv.mtime as approval_time, dev_dcv.mtime as last_modified from
            (device_class d, organizations org, device_code_version dev_dcv) left join
            device_code_version app_dcv on d.id = app_dcv.device_id and d.approved_version = app_dcv.version
            where org.id = d.owner and (d.approved_version is null or d.approved_version != d.developer_version)
            and dev_dcv.version = d.developer_version and dev_dcv.device_id = d.id order by last_modified desc`);
    }
}

export async function getDevicesForSetup(client, names, org) {
    if (org !== null && org.is_admin) {
        const query = `
            (select d.primary_kind, d.name, d.category, d.primary_kind as for_kind, dcv.code, dcv.factory
                from device_class d, device_code_version dcv where d.id = dcv.device_id and
                dcv.version = d.developer_version
                and d.primary_kind in (?))
            union distinct
            (select d.primary_kind, d.name, d.category, dck.kind as for_kind, dcv.code, dcv.factory from device_class d,
                device_code_version dcv, device_class_kind dck where dck.device_id = d.id and
                d.id = dcv.device_id and
                dcv.version = d.developer_version
                and dck.kind in (?))
            union distinct
            (select d.primary_kind, d.name, d.category, dck2.kind as for_kind, dcv.code, dcv.factory from device_class d,
                device_class d2, device_class_kind dck2, device_code_version dcv, device_class_kind dck
                where dck.device_id = d.id and d.id = dcv.device_id and
                dcv.version = d.developer_version
                and dck.kind = d2.primary_kind and dck2.device_id = d2.id and dck2.kind in (?))`;
        return db.selectAll(client, query, [names, names, names]);
    } else if (org !== null) {
        const query = `
            (select d.primary_kind, d.name, d.category, d.primary_kind as for_kind, dcv.code, dcv.factory
                from device_class d, device_code_version dcv where d.id = dcv.device_id and
                ((dcv.version = d.developer_version and d.owner = ?) or
                (dcv.version = d.approved_version and d.owner <> ?))
                and d.primary_kind in (?))
            union distinct
            (select d.primary_kind, d.name, d.category, dck.kind as for_kind, dcv.code, dcv.factory from device_class d,
                device_code_version dcv, device_class_kind dck where dck.device_id = d.id and
                d.id = dcv.device_id and
                ((dcv.version = d.developer_version and d.owner = ?) or
                (dcv.version = d.approved_version and d.owner <> ?))
                and dck.kind in (?))
            union distinct
            (select d.primary_kind, d.name, d.category, dck2.kind as for_kind, dcv.code, dcv.factory from device_class d,
                device_class d2, device_class_kind dck2, device_code_version dcv, device_class_kind dck
                where dck.device_id = d.id and d.id = dcv.device_id and
                ((dcv.version = d.developer_version and d.owner = ?) or
                (dcv.version = d.approved_version and d.owner <> ?))
                and dck.kind = d2.primary_kind and dck2.device_id = d2.id and dck2.kind in (?))`;
        return db.selectAll(client, query, [org.id, org.id, names, org.id, org.id, names, org.id, org.id, names]);
    } else {
        const query = `
            (select d.primary_kind, d.name, d.category, d.primary_kind as for_kind, dcv.code, dcv.factory
                from device_class d, device_code_version dcv where d.id = dcv.device_id and
                dcv.version = d.approved_version
                and d.primary_kind in (?))
            union distinct
            (select d.primary_kind, d.name, d.category, dck.kind as for_kind, dcv.code, dcv.factory from device_class d,
                device_code_version dcv, device_class_kind dck where dck.device_id = d.id and
                d.id = dcv.device_id and
                dcv.version = d.approved_version
                and dck.kind in (?))
            union distinct
            (select d.primary_kind, d.name, d.category, dck2.kind as for_kind, dcv.code, dcv.factory from device_class d,
                device_class d2, device_class_kind dck2, device_code_version dcv, device_class_kind dck
                where dck.device_id = d.id and d.id = dcv.device_id and
                dcv.version = d.approved_version
                and dck.kind = d2.primary_kind and dck2.device_id = d2.id and dck2.kind in (?))`;
        return db.selectAll(client, query, [names, names, names]);
    }
}
