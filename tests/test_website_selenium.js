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

require('thingengine-core/lib/polyfill');
require('./polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');

const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');

const BASE_URL = process.env.THINGENGINE_URL || 'http://127.0.0.1:8080';

async function withSelenium(test) {
    const builder = new webdriver.Builder()
        .forBrowser('firefox');

    // on Travis CI we run headless; setting up Xvfb is
    // just annoying and not very useful
    if (process.env.TRAVIS) {
        builder
        .setFirefoxOptions(
            new firefox.Options().headless()
        )
        .setChromeOptions(
            new chrome.Options().headless()
        );
    }

    const driver = builder.build();
    try {
        await test(driver);
    } finally {
        driver.quit();
    }
}

async function testBasic(driver) {
    await driver.get(BASE_URL + '/');

    const title = await driver.wait(
        webdriver.until.elementLocated(webdriver.By.id('almond-title')),
        30000);

    assert.strictEqual(await title.getText(), 'Almond');
}

async function main() {
    await withSelenium(testBasic);
}
module.exports = main;
if (!module.parent)
    main();
