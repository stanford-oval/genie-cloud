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

export interface Row {
    id : number;
    primary_kind : string;
    owner : number;
    name : string;
    description : string;
    license : string;
    license_gplcompatible : string;
    website : string;
    repository : string;
    issue_tracker : string;
    source_code : string;
    colors_dominant : string;
    colors_palette_default : string;
    colors_palette_light : string;
    category : 'physical' | 'online' | 'data' | 'system';
    subcategory : 'service' | 'media' | 'social-network' | 'communication' | 'home' | 'health' | 'data-management';
    approved_version : number|null;
    developer_version : number;
}
export type OptionalFields = 'category' | 'subcategory' | 'approved_version' | 'developer_version';

export interface DiscoveryServiceRow {
    device_id : number;
    discovery_type : 'bluetooth' | 'upnp';
    service : string;
}

export interface VersionedRow {
    device_id : number;
    version : number;
    code : string;
    factory : string;
    downloadable : boolean;
    module_type : string;
    mtime : Date;
}
export type VersionedOptionalFields = 'mtime';

export interface KindRow {
    device_id : number;
    kind : string;
    is_child : boolean;
}

async function insertKinds(client : db.Client, deviceId : number, extraKinds : string[], extraChildKinds : string[]) {
    const extraValues = [];
    for (const k of extraKinds)
        extraValues.push([deviceId, k, false]);
    for (const k of extraChildKinds)
        extraValues.push([deviceId, k, true]);
    if (extraValues.length === 0)
        return;

    await db.query(client, 'insert into device_class_kind(device_id, kind, is_child) values ?',
                    [extraValues]);
}

async function insertDiscoveryServices(client : db.Client, deviceId : number, discoveryServices : Array<Omit<DiscoveryServiceRow, "device_id">>) {
    if (discoveryServices.length === 0)
        return;

    await db.query(client, 'insert into device_discovery_services(device_id, discovery_type, service) values ?',
        [discoveryServices.map((ds) => [deviceId, ds.discovery_type, ds.service])]);
}

async function create<T extends db.Optional<Row, OptionalFields>>(client : db.Client,
                                                                  device : T,
                                                                  extraKinds : string[],
                                                                  extraChildKinds : string[],
                                                                  discoveryServices : Array<Omit<DiscoveryServiceRow, "device_id">>,
                                                                  versionedInfo : db.Optional<VersionedRow, "device_id" | "version" | VersionedOptionalFields>) {
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

async function update<T extends Partial<Row>>(client : db.Client, id : number, device : T,
                                              extraKinds : string[], extraChildKinds : string[],
                                              discoveryServices : Array<Omit<DiscoveryServiceRow, "device_id">>,
                                              versionedInfo : db.Optional<VersionedRow, "device_id" | "version" | VersionedOptionalFields>) {
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

export async function get(client : db.Client, id : number) : Promise<Row & { owner_name : string, owner_id_hash : string }> {
    return db.selectOne(client, `select d.*, o.name as owner_name, o.id_hash as owner_id_hash
        from device_class d left join organizations o on o.id = d.owner where d.id = ?`, [id]);
}

export type ByPrimaryKindRow = Pick<Row, "id"|"name"|"description"|"primary_kind"|"category"
    |"subcategory"|"developer_version"|"approved_version"|"website"|"repository"
    |"issue_tracker"|"license"|"license_gplcompatible"|"owner">
    & { owner_name : string, owner_id_hash : string };

export async function getByPrimaryKind(client : db.Client, kind : string, includeSourceCode : true) : Promise<ByPrimaryKindRow & { source_code : true }>;
export async function getByPrimaryKind(client : db.Client, kind : string, includeSourceCode ?: false) : Promise<ByPrimaryKindRow>;
export async function getByPrimaryKind(client : db.Client, kind : string, includeSourceCode ?: boolean) {
    return db.selectOne(client, `select ${includeSourceCode ? 'd.source_code,' : ''}
        d.id,d.name,d.description,d.primary_kind,d.category,
        d.subcategory,d.developer_version,d.approved_version,
        d.website,d.repository,d.issue_tracker,d.license,d.license_gplcompatible,
        d.owner,o.name as owner_name, o.id_hash as owner_id_hash
        from device_class d left join organizations o on o.id = d.owner where primary_kind = ?`, [kind]);
}

export async function getNamesByKinds(client : db.Client, kinds : string[]) : Promise<Record<string, Pick<Row, "id"|"name"|"primary_kind">>> {
    if (kinds.length === 0)
        return {};
    const rows = await db.selectAll(client, `select id,name,primary_kind from device_class where primary_kind in (?)`, [kinds]);
    const ret : Record<string, Pick<Row, "id"|"name"|"primary_kind">> = {};
    for (const row of rows)
        ret[row.primary_kind] = row;
    return ret;
}

export async function getByOwner(client : db.Client, owner : number) : Promise<Array<Pick<Row, "id"|"name"|"primary_kind"|"owner">>> {
    return db.selectAll(client, "select id,name,primary_kind,owner from device_class where owner = ? order by name asc", [owner]);
}

type BasicVersionedRow = Pick<Row & VersionedRow, "code" | "version" | "approved_version"
    | "developer_version" | "primary_kind" | "name" | "description"
    | "category" | "subcategory" | "website" | "repository" | "issue_tracker" | "license">;

export async function getFullCodeByPrimaryKind(client : db.Client, kind : string, orgId : number|null) : Promise<BasicVersionedRow[]> {
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

export async function getFullCodeByPrimaryKinds(client : db.Client, kinds : string[], orgId : number|null) : Promise<BasicVersionedRow[]> {
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

type BasicRow = Pick<Row & VersionedRow, "primary_kind" | "name" | "description"
    | "category" | "subcategory" | "website" | "repository" | "issue_tracker" | "license">;
type BasicOrg = { id : number, is_admin : boolean };

export async function getByFuzzySearch(client : db.Client, tag : string, org : BasicOrg|null) : Promise<BasicRow[]> {
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

export async function getCodeByVersion(client : db.Client, id : number, version : number) : Promise<string> {
    return db.selectOne(client, "select code from device_code_version where device_id = ? and version = ?",
        [id, version]).then((row : { code : string }) => row.code);
}

export type DiscoveryRow = Pick<Row, "id"|"name"|"description"|"primary_kind"|"category"
    |"subcategory"|"developer_version"|"approved_version"|"owner"> & { kinds ?: string[] };

export async function getByAnyKind(client : db.Client, kind : string) : Promise<DiscoveryRow[]> {
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

export async function getByDiscoveryService(client : db.Client, discoveryType : 'upnp'|'bluetooth', service : string) : Promise<DiscoveryRow[]> {
    return db.selectAll(client, `select d.id,d.name,d.description,d.primary_kind,d.category,
        d.subcategory,d.developer_version,d.approved_version,d.owner from device_class d,
        device_discovery_services dds where dds.device_id = d.id and dds.discovery_type = ?
        and dds.service = ?`,
        [discoveryType, service]);
}

export type FactoryRow = Pick<Row & VersionedRow, "primary_kind"|"category"|"name"|"code"|"factory">;

export async function getByCategoryWithCode(client : db.Client, category : string, org : BasicOrg|null) : Promise<FactoryRow[]> {
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

export async function getBySubcategoryWithCode(client : db.Client, category : string, org : BasicOrg|null) : Promise<FactoryRow[]> {
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

export async function getAllApprovedWithCode(client : db.Client, org : BasicOrg|null, start ?: number, end ?: number) : Promise<FactoryRow[]> {
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

async function _getByField(client : db.Client, field : keyof Row, value : unknown, org : BasicOrg|null, start ?: number, end ?: number) : Promise<BasicRow[]> {
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

export async function getByCategory(client : db.Client, category : string, org : BasicOrg|null, start ?: number, end ?: number) {
    return _getByField(client, 'category', category, org, start, end);
}

export async function getBySubcategory(client : db.Client, category : string, org : BasicOrg|null, start ?: number, end ?: number) {
    return _getByField(client, 'subcategory', category, org, start, end);
}

type DownloadRow = Pick<Row & VersionedRow, "downloadable" | "owner" | "approved_version" | "version">;

export async function getDownloadVersion(client : db.Client, kind : string, org : BasicOrg|null) : Promise<DownloadRow> {
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

export async function getAllApprovedByOwner(client : db.Client, owner : number) : Promise<BasicRow[]> {
    return db.selectAll(client, `select primary_kind, name, description,
        website, repository, issue_tracker, license,
        category, subcategory from device_class
        where approved_version is not null and owner = ? order by name`, [owner]);
}

export async function getAllApproved(client : db.Client, org : BasicOrg|null, start ?: number, end ?: number) : Promise<BasicRow[]> {
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
                website, repository, issue_tracker, license,
                category, subcategory from device_class
                where approved_version is not null order by name`);
        }
    }
}

export async function getAllKinds(client : db.Client, id : number) : Promise<KindRow[]> {
    return db.selectAll(client, "select * from device_class_kind where device_id = ? "
                        + "order by kind", [id]);
}
export async function getAllDiscoveryServices(client : db.Client, id : number, discoveryType : 'upnp' | 'bluetooth') : Promise<DiscoveryServiceRow[]> {
    return db.selectAll(client, "select * from device_discovery_services where device_id = ? and discovery_type = ?", [id, discoveryType]);
}

export {
    create,
    update,
};
async function _delete(client : db.Client, id : number) {
    await db.query(client, "delete from device_class where id = ?", [id]);
}
export { _delete as delete };

export async function approve(client : db.Client, kind : string) {
    await db.query(client, "update device_class set approved_version = developer_version where primary_kind = ?", [kind]);
}
export async function unapprove(client : db.Client, kind : string) {
    await db.query(client, "update device_class set approved_version = null where primary_kind = ?", [kind]);
}

export async function getFeatured(client : db.Client, count = 6) : Promise<Array<Pick<Row, "id"|"name"|"primary_kind">>> {
    return db.selectAll(client, `select d.id,d.name,d.primary_kind from device_class d, device_class_tag dt, device_code_version dcv
        where dt.device_id = d.id and dt.tag = 'featured' and d.approved_version = dcv.version and dcv.device_id = d.id
        order by mtime desc limit ?`,
        [count]);
}

type ReviewRow = Pick<Row, "id"|"primary_kind"|"name"|"approved_version"|"developer_version"|"owner"> & {
    owner_name : string;
    approval_time : VersionedRow['mtime']|null,
    last_modified : VersionedRow['mtime']
};

export async function getReviewQueue(client : db.Client, start ?: number, end ?: number) : Promise<ReviewRow[]> {
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

type SetupRow = Pick<Row & VersionedRow, "primary_kind"|"name"|"category"|"code"|"factory"> & { for_kind : string };

export async function getDevicesForSetup(client : db.Client, names : string[], org : BasicOrg|null) : Promise<SetupRow[]> {
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
