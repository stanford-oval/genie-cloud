// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2015-2021 The Board of Trustees of the Leland Stanford Junior University
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

import * as db from '../db';
import * as deviceModel from '../../model/device';

export interface DataType {
    kind : 'bluetooth';
    class : number;
    uuids : string[];
}

function getBestResult(results : deviceModel.DiscoveryRow[], uuids : string[]) {
    // first look for a perfect match
    for (let i = 0; i < results.length; i++) {
        if (uuids.length !== results[i].kinds!.length)
            continue;

        if (uuids.every((u, j) => ('uuid-' + u === results[i].kinds![j])))
            return results[i];
    }

    // first look for a subset match
    for (let i = 0; i < results.length; i++) {
        if (uuids.every((u, j) => ('uuid-' + u === results[i].kinds![j])))
            return results[i];
    }

    // then just pick any device from the list
    // we could further refine the list ranking the UUIDs
    // (to filter overly generic stuff like OBEX)
    // and picking the one that match the most
    return results[0];
}

async function tryWithService(dbClient : db.Client, service : string) {
    const results = await deviceModel.getByDiscoveryService(dbClient, 'bluetooth', service);
    return Promise.all(results.map(async (d) => {
        const services = await deviceModel.getAllDiscoveryServices(dbClient, d.id, 'bluetooth');
        d.kinds = services.map((s) => s.service);
        d.kinds.sort();
        return d;
    }));
}

function decodeClass(btClass : number) {
    const devicePart = btClass & 0x1FFF;

    switch (devicePart) {
    case 0x00000900:
        return 'health';

    case 0x00000400:
        return 'audio-video';

    case 0x00000200:
        return 'phone';

    default:
        // anything else lacks defined profiles and is essentially useless
        return null;
    }
}

export async function decode(dbClient : db.Client, data : DataType) {
    if (typeof data.class !== 'number' ||
        typeof data.uuids !== 'object')
        return null; // malformed

    if (!Array.isArray(data.uuids))
        data.uuids = [];
    data.uuids = data.uuids.map((u) => u.toLowerCase());
    data.uuids.sort();

    for (const uuid of data.uuids) {
        const results = await tryWithService(dbClient, 'uuid-' + uuid);
        if (results.length > 0)
            return getBestResult(results, data.uuids);
    }

    const classKind = decodeClass(data.class);
    if (classKind !== null) {
        const results = await tryWithService(dbClient, 'class-' + classKind);
        if (results.length > 0)
            return getBestResult(results, data.uuids);
    }

    return deviceModel.getByPrimaryKind(dbClient, 'org.thingpedia.builtin.bluetooth.generic');
}
