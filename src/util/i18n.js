// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as path from 'path';
import Gettext from 'node-gettext';
import * as gettextParser from 'gettext-parser';
import * as fs from 'fs';
import acceptLanguage from 'accept-language';
import assert from 'assert';
import * as Genie from 'genie-toolkit';

import { InternalError } from './errors';
import * as userUtils from './user';

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
    'es': N_("Spanish"),
    'es-ES': N_("Spanish"),
};

let _enabledLanguages;
const languages = {};

function loadTextdomainDirectory(gt, locale, domain, modir) {
    assert(fs.existsSync(modir));

    let split = locale.split(/[-_.@]/);
    let mo = modir + '/' + split.join('_') + '.mo';

    while (!fs.existsSync(mo) && split.length) {
        split.pop();
        mo = modir + '/' + split.join('_') + '.mo';
    }
    if (split.length === 0) {
        console.error(`No translations found in ${domain} for locale ${locale}`);
        return;
    }
    try {
        let loaded = gettextParser.mo.parse(fs.readFileSync(mo), 'utf-8');
        gt.addTranslations(locale, domain, loaded);
    } catch(e) {
        console.log(`Failed to load translations for ${locale}/${domain}: ${e.message}`);
    }
}

export function init(langs) {
        _enabledLanguages = langs;
    if (langs.length === 0)
        throw new InternalError('E_INVALID_CONFIG', `Configuration error: must enable at least one language`);

    for (let locale of langs) {
        if (!(locale in ALLOWED_LANGUAGES))
            throw new InternalError('E_INVALID_CONFIG', `Configuration error: locale ${locale} is enabled but is not supported`);

        let gt = new Gettext();
        if (locale !== 'en-US') {
            let modir = path.resolve(path.dirname(module.filename), '../../po');//'
            loadTextdomainDirectory(gt, locale, 'almond-cloud', modir);
            modir = path.resolve(path.dirname(module.filename), '../../node_modules/genie-toolkit/po');
            loadTextdomainDirectory(gt, locale, 'genie-toolkit', modir);
        }
        gt.textdomain('almond-cloud');
        gt.setLocale(locale);

        // prebind the gt for ease of use, because the usual gettext API is not object-oriented
        const prebound = {
            locale,
            genie: Genie.I18n.get(locale),

            gettext: gt.gettext.bind(gt),
            ngettext: gt.ngettext.bind(gt),
            pgettext: gt.pgettext.bind(gt),

            dgettext: gt.dgettext.bind(gt),
            dngettext: gt.dngettext.bind(gt),
            dpgettext: gt.dpgettext.bind(gt),
        };

        let split = locale.split('-');
        while (split.length > 0) {
            languages[split.join('-')] = prebound;
            split.pop();
        }
    }

    acceptLanguage.languages(langs);
}

export function getLangName(_, lang) {
    return _(ALLOWED_LANGUAGES[lang]);
}

export function localeToLanguage(locale = 'en') {
    locale = locale.toLowerCase();

    // for Chinese, we need to distinguish Traditional vs Simplified
    if (locale === 'zh-tw' || locale === 'zh-cn')
        return locale;

    // for other languages, we only keep the language part of the locale

    // FIXME: in the future, we definitely need to distinguish en-US from
    // other en-*, because our templates and datasets are very Americentric
    return locale.split(/[-_@.]/)[0];
}

export function get(locale, fallback = true) {
    if (!_enabledLanguages)
        throw new InternalError('E_I18N_NOT_INIT', `Internationalization support was not initialized`);

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

export function handler(req, res, next) {
    if (!_enabledLanguages)
        throw new InternalError('E_I18N_NOT_INIT', `Internationalization support was not initialized`);

    let locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    if (!locale && userUtils.isAuthenticated(req))
        locale = req.user.locale;
    if (!locale && req.headers['accept-language'])
        locale = acceptLanguage.get(req.headers['accept-language']);
    if (!locale)
        locale = _enabledLanguages[0];
    let lang = get(locale);

    req.locale = locale;
    req.gettext = lang.gettext;
    req._ = req.gettext;
    req.pgettext = lang.pgettext;
    req.ngettext = lang.ngettext;

    res.locals.I18n = module.exports;
    res.locals.locale = locale;
    res.locals.gettext = req.gettext;
    res.locals._ = req._;
    res.locals.pgettext = req.pgettext;
    res.locals.ngettext = req.ngettext;

    res.locals.timezone = req.user ? req.user.timezone : 'America/Los_Angeles';
    next();
}
