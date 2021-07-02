// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

import { Ast, Type } from 'thingtalk';
import * as tokenizer from './tokenize';
import { InternalError } from './errors';

function entityTypeToHTMLType(type : string) {
    switch (type) {
    case 'tt:password':
        return 'password';
    case 'tt:url':
        return 'url';
    case 'tt:phone_number':
        return 'tel';
    case 'tt:email_address':
        return 'email';
    default:
        return 'text';
    }
}

function getInputParam(config : Ast.MixinImportStmt, name : string) {
    for (const inParam of config.in_params) {
        if (inParam.name === name)
            return inParam.value.toJS();
    }
    return undefined;
}

function makeDeviceFactory(classDef : Ast.ClassDef, device : { category : string, primary_kind : string, name : string }) {
    if (classDef.is_abstract)
        return null;

    const config = classDef.config!;

    function toFields(argMap : Record<string, Type>) {
        if (!argMap)
            return [];
        return Object.keys(argMap).map((k) => {
            const type = argMap[k];
            let htmlType;
            if (type instanceof Type.Entity)
                htmlType = entityTypeToHTMLType(type.type);
            else if (type.isNumber || type.isMeasure)
                htmlType = 'number';
            else if (type.isBoolean)
                htmlType = 'checkbox';
            else
                htmlType = 'text';
            return { name: k, label: tokenizer.clean(k), type: htmlType };
        });
    }

    switch (config.module) {
    case 'org.thingpedia.config.builtin':
        return null;

    case 'org.thingpedia.config.discovery.bluetooth':
        return {
            type: 'discovery',
            category: device.category,
            kind: device.primary_kind,
            text: device.name,
            discoveryType: 'bluetooth'
        };
    case 'org.thingpedia.config.discovery.upnp':
        return {
            type: 'discovery',
            category: device.category,
            kind: device.primary_kind,
            text: device.name,
            discoveryType: 'upnp'
        };

    case 'org.thingpedia.config.interactive':
        return {
            type: 'interactive',
            category: device.category,
            kind: device.primary_kind,
            text: device.name
        };

    case 'org.thingpedia.config.none':
        return {
            type: 'none',
            category: device.category,
            kind: device.primary_kind,
            text: device.name
        };

    case 'org.thingpedia.config.oauth2':
    case 'org.thingpedia.config.custom_oauth':
        return {
            type: 'oauth2',
            category: device.category,
            kind: device.primary_kind,
            text: device.name
        };

    case 'org.thingpedia.config.form':
        return {
            type: 'form',
            category: device.category,
            kind: device.primary_kind,
            text: device.name,
            fields: toFields(getInputParam(config, 'params') as Record<string, Type>)
        };

    case 'org.thingpedia.config.basic_auth':
        return {
            type: 'form',
            category: device.category,
            kind: device.primary_kind,
            text: device.name,
            fields: [
                { name: 'username', label: 'Username', type: 'text' },
                { name: 'password', label: 'Password', type: 'password' }
            ].concat(toFields(getInputParam(config, 'extra_params') as Record<string, Type>))
        };

    default:
        throw new InternalError('E_INVALID_DEVICE_AFTER_VALIDATION', `Unrecognized config mixin ${config.module}`);
    }
}

function getDiscoveryServices(classDef : Ast.ClassDef) {
    if (classDef.is_abstract)
        return [];

    const config = classDef.config!;
    switch (config.module) {
    case 'org.thingpedia.config.discovery.bluetooth': {
        const uuids = getInputParam(config, 'uuids') as string[];
        const deviceClass = getInputParam(config, 'device_class') as number;

        const services = uuids.map((u) => {
            return {
                discovery_type: 'bluetooth',
                service: 'uuid-' + u.toLowerCase()
            } as const;
        });
        if (deviceClass) {
            services.push({
                discovery_type: 'bluetooth',
                service: 'class-' + deviceClass
            } as const);
        }
        return services;
    }
    case 'org.thingpedia.config.discovery.upnp':
        return (getInputParam(config, 'search_target') as string[]).map((st) => {
            return {
                discovery_type: 'upnp',
                service: st.toLowerCase().replace(/^urn:/, '').replace(/:/g, '-')
            } as const;
        });
    default:
        return [];
    }
}

export {
    makeDeviceFactory,
    getDiscoveryServices
};
