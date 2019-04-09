// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const path = require('path');
const Gettext = require('node-gettext');
const gettextParser = require('gettext-parser');
const fs = require('fs');

const Config = require('../config');

const LANGS = Config.SUPPORTED_LANGUAGES;
const languages = {};

function loadTextdomainDirectory(gt, locale, domain, modir) {
    let split = locale.split(/[-_.@]/);
    let mo = modir + '/' + split.join('_') + '.mo';

    while (!fs.existsSync(mo) && split.length) {
        split.pop();
        mo = modir + '/' + split.join('_') + '.mo';
    }
    if (split.length === 0)
        return;
    try {
        let loaded = gettextParser.mo.parse(fs.readFileSync(mo), 'utf-8');
        gt.addTranslations(locale, domain, loaded);
    } catch(e) {
        console.log(`Failed to load translations for ${locale}/${domain}: ${e.message}`);
    }
}

function load() {
    for (let l of LANGS) {
        let gt = new Gettext();
        if (l !== 'en-US') {
            let modir = path.resolve(path.dirname(module.filename), '../po');//'
            loadTextdomainDirectory(gt, l, 'thingengine-platform-cloud', modir);
            modir = path.resolve(path.dirname(module.filename), '../node_modules/thingtalk/po');
            loadTextdomainDirectory(gt, l, 'thingtalk', modir);
            modir = path.resolve(path.dirname(module.filename), '../node_modules/almond/po');
            loadTextdomainDirectory(gt, l, 'almond', modir);
            modir = path.resolve(path.dirname(module.filename), '../node_modules/thingengine-core/po');
            loadTextdomainDirectory(gt, l, 'thingengine-core', modir);
        }
        gt.textdomain('thingengine-platform-cloud');
        gt.setLocale(l);

        let split = l.split('-');
        while (split.length > 0) {
            languages[split.join('-')] = gt;
            split.pop();
        }
    }
}
load();

module.exports = {
    LANGS,

    localeToLanguage(locale) {
        // only keep the language part of the locale, we don't
        // yet distinguish en_US from en_GB
        return (locale || 'en').split(/[-_@.]/)[0];
    },

    get(locale, fallback = true) {
        locale = locale.split(/[-_@.,]/);
        let lang = languages[locale.join('-')];
        while (!lang && locale.length > 0) {
            locale.pop();
            lang = languages[locale.join('-')];
        }
        if (!lang && fallback)
            lang = languages['en-US'];
        return lang;
    }
};
