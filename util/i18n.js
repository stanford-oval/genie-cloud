// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const path = require('path');
const Gettext = require('node-gettext');

const LANGS = ['en-US', 'it', 'zh-CN'];
const languages = {};
for (let l of LANGS) {
    let gt = new Gettext();
    gt.setlocale(l);
    if (l !== 'en-US') {
        try {
            let modir = path.resolve(path.dirname(module.filename), '../po');
            gt.loadTextdomainDirectory('thingengine-platform-cloud', modir);
        } catch(e) {
            console.log('Failed to load translations for ' + l + ': ' + e.message);
        }
        try {
            let modir = path.resolve(path.dirname(module.filename), '../node_modules/thingtalk/po');
            gt.loadTextdomainDirectory('thingtalk', modir);
        } catch(e) {
            console.log('Failed to load translations for ' + l + ': ' + e.message);
        }
    }
    languages[l] = gt;
}

module.exports = {
    LANGS,

    get(locale) {
        locale = locale.split(/[-_\@\.,]/);
        let lang = languages[locale.join('-')];
        while (!lang && locale.length > 0) {
            locale.pop();
            lang = languages[locale.join('-')];
        }
        if (!lang)
            lang = languages['en-US'];
        return lang;
    }
}
