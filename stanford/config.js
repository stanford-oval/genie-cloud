// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

// OVAL specific configuration for Web Almond

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
];

module.exports.EXTRA_NAVBAR = [
    {
        url: 'https://oval.cs.stanford.edu',
        title: _("OVAL Lab"),
    },
];

module.exports.DISCOURSE_SSO_REDIRECT = 'https://discourse.almond.stanford.edu';
