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
const acceptLanguage = require('accept-language');

const { InternalError } = require('./errors');
const Config = require('../config');
const userUtils = require('./user');

function N_(x) { return x; }
const ALLOWED_LANGUAGES = {
    'en': N_("English"),
    'en-US': N_("English (United States)"),
    'en-GB': N_("English (United Kingdom)"),
    'it': N_("Italian"),
    'it-IT': N_("Italian"),
    'zh': N_("Chinese"),
    'zh-CN': N_("Chinese (Simplified)"),
    'zh-TW': N_("Chinese (Traditional)"),
};

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
    if (LANGS.length === 0)
        throw new InternalError('E_INVALID_CONFIG', `Configuration error: must enable at least one language`);

    for (let l of LANGS) {
        if (!(l in ALLOWED_LANGUAGES))
            throw new InternalError('E_INVALID_CONFIG', `Configuration error: locale ${l} is enabled but is not supported`);

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

        // prebind the gt for ease of use, because the usual gettext API is not object-oriented
        const prebound = {
            gettext: gt.gettext.bind(gt),
            ngettext: gt.ngettext.bind(gt),
            pgettext: gt.pgettext.bind(gt),

            dgettext: gt.dgettext.bind(gt),
            dngettext: gt.dngettext.bind(gt),
            dpgettext: gt.dpgettext.bind(gt),
        };

        let split = l.split('-');
        while (split.length > 0) {
            languages[split.join('-')] = prebound;
            split.pop();
        }
    }

    acceptLanguage.languages(LANGS);
}
load();

const self = {
    LANGS,

    getLangName(_, lang) {
        return _(ALLOWED_LANGUAGES[lang]);
    },

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
    },

    handler(req, res, next) {
        let locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
        if (!locale && userUtils.isAuthenticated(req))
            locale = req.user.locale;
        if (!locale && req.headers['accept-language'])
            locale = acceptLanguage.get(req.headers['accept-language']);
        if (!locale)
            locale = LANGS[0];
        let lang = self.get(locale);

        req.locale = locale;
        req.gettext = lang.gettext;
        req._ = req.gettext;
        req.pgettext = lang.pgettext;
        req.ngettext = lang.ngettext;

        res.locals.I18n = self;
        res.locals.locale = locale;
        res.locals.gettext = req.gettext;
        res.locals._ = req._;
        res.locals.pgettext = req.pgettext;
        res.locals.ngettext = req.ngettext;

        res.locals.timezone = req.user ? req.user.timezone : 'America/Los_Angeles';
        next();
    }
};
module.exports = self;
