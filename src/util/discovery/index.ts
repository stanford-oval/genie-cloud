// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2021 The Board of Trustees of the Leland Stanford Junior University
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

import * as BluetoothDiscovery from './bluetooth';
import * as UpnpDiscovery from './upnp';

// a meta-module that collects all server-side modules that deal with discovering

export type DiscoveryData = BluetoothDiscovery.DataType | UpnpDiscovery.DataType;

export function decode(dbClient : db.Client, data : DiscoveryData) {
    if (data.kind === 'bluetooth')
        return BluetoothDiscovery.decode(dbClient, data);
    else if (data.kind === 'upnp')
        return UpnpDiscovery.decode(dbClient, data);
    else
        return null;
}
