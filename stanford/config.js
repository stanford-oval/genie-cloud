// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// Mobisocial specific configuration for Web Almond

// overrides the about pages to point to our website, adds the research
// and get-almond page

// gettext marker
function _(x) { return x; }

module.exports.USE_BRAND = 'stanford';
module.exports.WITH_THINGPEDIA = 'embedded';
module.exports.THINGPEDIA_URL = '/thingpedia';
module.exports.SERVER_ORIGIN = 'https://almond.stanford.edu';
module.exports.OAUTH_REDIRECT_ORIGIN = 'https://thingengine.stanford.edu';

module.exports.ABOUT_OVERRIDE = {
    index: 'stanford/about_index.pug',
    tos: 'stanford/about_tos.pug',
    privacy: 'stanford/about_privacy.pug'
};

module.exports.EXTRA_ABOUT_PAGES = [
    {
        url: 'get-almond',
        view: 'stanford/about_get_almond.pug',
        title: _("Get Almond")
    },
    {
        url: 'get-involved',
        view: 'stanford/about_get_involved.pug',
        title: _("Get Involved With Almond")
    },
    {
        url: 'use-almond',
        view: 'stanford/about_use_almond.pug',
        title: _("Use Almond In Your Product")
    }
];

module.exports.EXTRA_NAVBAR = [
    {
        url: 'https://oval.cs.stanford.edu',
        title: _("OVAL Lab"),
    },
    {
        url: '/blog',
        title: _("News"),
    },
];

module.exports.DISCOURSE_SSO_REDIRECT = 'https://discourse.almond.stanford.edu';
