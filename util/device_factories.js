// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const tokenizer = require('./tokenize');

function entityTypeToHTMLType(type) {
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

function makeDeviceFactory(classDef, device) {
    const config = classDef.config;
    function getInputParam(name) {
        for (let inParam of config.in_params) {
            if (inParam.name === name)
                return inParam.value.toJS();
        }
        return undefined;
    }
    function toFields(argMap) {
        return Object.keys(argMap).map((k) => {
            const type = argMap[k];
            let htmlType;
            if (type.isEntity)
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

    case 'org.thingpedia.config.discovery':
        return {
            type: 'discovery',
            category: device.category,
            kind: device.primary_kind,
            text: device.name,
            discoveryType: getInputParam('protocol')
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
            fields: toFields(getInputParam('params'))
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
            ].concat(toFields(getInputParam('extra_params')))
        };

    default:
        throw new Error(`Unrecognized config mixin ${config.module}`);
    }
}

module.exports = {
    makeDeviceFactory
};
