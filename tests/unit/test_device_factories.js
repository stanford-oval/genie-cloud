// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const ThingTalk = require('thingtalk');

const DeviceFactoryUtils = require('../../util/device_factories');

const TEST_CASES = [
    [`class @com.bing {
        import loader from @org.thingpedia.v2();
        import config from @org.thingpedia.config.none();
    }`, {
        primary_kind: "com.bing",
        name: "Bing Search",
        category: 'data',
    }, {
        type: 'none',
        text: "Bing Search",
        kind: 'com.bing',
        category: 'data'
    }],

    [`class @com.bodytrace.scale {
        import loader from @org.thingpedia.v2();
        import config from @org.thingpedia.config.basic_auth(extra_params=makeArgMap(serial_number : String));
    }`, {
        primary_kind: "com.bodytrace.scale",
        name: "BodyTrace Scale",
        category: 'physical',
    }, {
        type: 'form',
        text: "BodyTrace Scale",
        kind: 'com.bodytrace.scale',
        category: 'physical',
        fields: [
            { name: 'username', label: 'Username', type: 'text' },
            { name: 'password', label: 'Password', type: 'password' },
            { name: 'serial_number', label: 'serial number', type: 'text' },
        ]
    }],

    [`class @org.thingpedia.rss {
        import loader from @org.thingpedia.rss();
        import config from @org.thingpedia.config.form(params=makeArgMap(url : Entity(tt:url)));
    }`, {
        primary_kind: "org.thingpedia.rss",
        name: "RSS Feed",
        category: 'data',
    }, {
        type: 'form',
        text: "RSS Feed",
        kind: 'org.thingpedia.rss',
        category: 'data',
        fields: [
            { name: 'url', label: 'url', type: 'url' },
        ]
    }],

    [`class @com.twitter {
        import loader from @org.thingpedia.v2();
        import config from @org.thingpedia.config.custom_oauth();
    }`, {
        primary_kind: "com.twitter",
        name: "Twitter Account",
        category: 'online',
    }, {
        type: 'oauth2',
        text: "Twitter Account",
        kind: 'com.twitter',
        category: 'online',
    }],

    [`class @com.linkedin {
        import loader from @org.thingpedia.v2();
        import config from @org.thingpedia.config.oauth2(client_id="foo", client_secret="bar");
    }`, {
        primary_kind: "com.linkedin",
        name: "LinkedIn Account",
        category: 'online',
    }, {
        type: 'oauth2',
        text: "LinkedIn Account",
        kind: 'com.linkedin',
        category: 'online',
    }],

    [`class @com.lg.tv.webos2 {
        import loader from @org.thingpedia.v2();
        import config from @org.thingpedia.config.discovery.upnp(search_target=['urn:lge:com:service:webos:second-screen-1']);
    }`, {
        primary_kind: "com.lg.tv.webos2",
        name: "LG TV",
        category: 'physical',
    }, {
        type: 'discovery',
        text: "LG TV",
        kind: 'com.lg.tv.webos2',
        category: 'physical',
        discoveryType: 'upnp'
    }],

    [`class @org.thingpedia.bluetooth.speaker.a2dp {
        import loader from @org.thingpedia.v2();
        import config from @org.thingpedia.config.discovery.bluetooth(uuids=['0000110b-0000-1000-8000-00805f9b34fb']);
    }`, {
        primary_kind: "org.thingpedia.bluetooth.speaker.a2dp",
        name: "Bluetooth Speaker",
        category: 'physical',
    }, {
        type: 'discovery',
        text: "Bluetooth Speaker",
        kind: 'org.thingpedia.bluetooth.speaker.a2dp',
        category: 'physical',
        discoveryType: 'bluetooth'
    }],
];

async function testCase(i) {
    console.log(`Test Case #${i+1}`);
    const [classCode, device, expectedFactory] = TEST_CASES[i];

    const classDef = ThingTalk.Grammar.parse(classCode).classes[0];
    const generatedFactory = DeviceFactoryUtils.makeDeviceFactory(classDef, device);

    try {
        assert.deepStrictEqual(generatedFactory, expectedFactory);
    } catch(e) {
        console.error('Failed: ' + e.message);
        if (process.env.TEST_MODE)
            throw e;
    }
}
async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await testCase(i);
}
module.exports = main;
if (!module.parent)
    main();
