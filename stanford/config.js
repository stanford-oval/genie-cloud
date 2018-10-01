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

module.exports.ABOUT_OVERRIDE = {
    index: 'stanford/about_index.pug',
    tos: 'stanford/about_tos.pug',
    privacy: 'stanford/about_privacy.pug'
};

module.exports.EXTRA_ABOUT_PAGES = [
    {
        url: 'research',
        view: 'stanford/about_research.pug',
        title: _("Almond - The Open Virtual Assistant"),
        navbar: _("Research")
    },
    {
        url: 'get-almond',
        view: 'stanford/about_get_almond.pug',
        title: _("Getting Almond"),
        navbar: null
    }
];
