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
// Author: Rakesh Ramesh <rakeshr@cs.stanford.edu>

import * as db from '../db';
import * as deviceModel from '../../model/device';

export interface DataType {
    kind : 'upnp';
    name : string;
    st : string[];
}

function getBestResult(results : deviceModel.DiscoveryRow[], st : string[]) {
    // first look for a perfect match
    for (let i = 0; i < results.length; i++) {
        if (st.length !== results[i].kinds!.length)
            continue;

        if (st.every((u, j) => (u === results[i].kinds![j])))
            return results[i];
    }

    // first look for a subset match
    for (let i = 0; i < results.length; i++) {
        if (st.every((u, j) => (u === results[i].kinds![j])))
            return results[i];
    }

    // then just pick any device from the list
    // we could further refine the list ranking the UUIDs
    // (to filter overly generic stuff like schemas-upnp-org:device:Basic:1)
    // and picking the one that match the most
    return results[0];
}

async function tryWithService(dbClient : db.Client, st : string) {
    const results = await deviceModel.getByDiscoveryService(dbClient, 'upnp', st);
    return Promise.all(results.map(async (d) => {
        const services = await deviceModel.getAllDiscoveryServices(dbClient, d.id, 'upnp');
        d.kinds = services.map((s) => s.service);
        d.kinds.sort();
        return d;
    }));
}

export async function decode(dbClient : db.Client, data : DataType) {
    // hue does not use the standard UPnP way to discover services and capabilities
	if (data.name.indexOf('hue') >= 0)
		return deviceModel.getByPrimaryKind(dbClient, 'com.hue');

	if (!Array.isArray(data.st))
        data.st = [];
    data.st = data.st.map((u) => (u.toLowerCase().replace(/^urn:/, '').replace(/:/g, '-')));
    data.st.sort();

    for (const st of data.st) {
        const results = await tryWithService(dbClient, st);
        if (results.length > 0)
            return getBestResult(results, data.st);
    }
    return null;
}
