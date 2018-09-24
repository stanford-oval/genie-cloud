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

const WD = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');

const BASE_URL = process.env.THINGENGINE_URL || 'http://127.0.0.1:8080';

async function withSelenium(test) {
    const builder = new WD.Builder()
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

async function login(driver, username, password) {
    await driver.get(BASE_URL + '/');

    const loginLink = await driver.wait(
        WD.until.elementLocated(WD.By.linkText('Log In')),
        30000);
    await loginLink.click();

    const submit = await driver.wait(
        WD.until.elementLocated(WD.By.css('button.btn.btn-primary[type=submit]')),
        30000);

    const usernameEntry = await driver.findElement(WD.By.id('username'));
    await usernameEntry.sendKeys(username);

    const passwordEntry = await driver.findElement(WD.By.id('password'));
    await passwordEntry.sendKeys(password);

    await submit.click();
}

async function testBasic(driver) {
    await driver.get(BASE_URL + '/');

    const title = await driver.wait(
        WD.until.elementLocated(WD.By.id('almond-title')),
        30000);

    assert.strictEqual(await title.getText(), 'Almond');
}

async function skipDataCollectionConfirmation(driver) {
    await driver.get(BASE_URL + '/me');
    await driver.wait(
        WD.until.elementLocated(WD.By.id('input')),
        30000);

    let messages = await driver.findElements(WD.By.css('.message'));
    assert.strictEqual(await messages[0].getText(), `Hello! I'm Almond, your virtual assistant.`); //'

    // ignore the blurb about data collection, skip to the yes/no question
    // at the end
    await driver.wait(
        WD.until.elementLocated(WD.By.css('.message.message-yesno.btn')),
        30000);
    const yesNo = await driver.findElements(WD.By.css('.message.message-yesno.btn'));
    assert.strictEqual(yesNo.length, 2);
    assert.strictEqual(await yesNo[0].getText(), 'Yes');
    assert.strictEqual(await yesNo[1].getText(), 'No');
    // click no
    await yesNo[1].click();
}

async function testMyConversation(driver) {
    await login(driver, 'bob', '12345678');

    await skipDataCollectionConfirmation(driver);

    // refresh the page
    await driver.get(BASE_URL + '/me');

    const inputEntry = await driver.wait(
        WD.until.elementLocated(WD.By.id('input')),
        30000);

    let messages = await driver.findElements(WD.By.css('.message'));
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(await messages[0].getText(), `Welcome back!`);

    await inputEntry.sendKeys('hello', WD.Key.ENTER);

    const ourInput = await driver.wait(
        WD.until.elementLocated(WD.By.css('.message.from-user:nth-child(2)')),
        10000);
    assert.strictEqual(await ourInput.getText(), 'hello');

    const response = await driver.wait(
        WD.until.elementLocated(WD.By.css('.from-almond:nth-child(3) .message')),
        10000);
    assert.strictEqual(await response.getText(), 'Hi!');
}

async function main() {
    await withSelenium(testBasic);
    await withSelenium(testMyConversation);
}
module.exports = main;
if (!module.parent)
    main();
