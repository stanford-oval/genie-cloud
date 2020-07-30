// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

require('./polyfill');

const SearchOrInfiniteScroll = require('./deps/search-or-infinite-scroll');

$(() => {
    const CDN_HOST = document.body.dataset.iconCdn;

    new SearchOrInfiniteScroll({
        container: '#thingpedia-devices',
        url: '/thingpedia/api/v3/devices/all',
        searchUrl: '/thingpedia/api/v3/devices/search',
        autoScrollOnStart: true,

        render(dev) {
            const deviceContainer = $('<div>').addClass('col-lg-4 col-md-6 aligned-grid-item dev-template');
            const panel = $('<a>').attr('href', '/thingpedia/devices/by-id/' + dev.primary_kind).addClass('panel panel-default');
            deviceContainer.append(panel);

            const heading = $('<div>').addClass('panel-heading').text(dev.name);
            panel.append(heading);

            const panelBody = $('<div>').addClass('panel-body');
            const deviceIconContainer = $('<p>').addClass('device-icon-small');
            const deviceIcon = $('<img>');
            deviceIcon.attr('src', CDN_HOST + '/icons/' + dev.primary_kind + '.png')
                .attr("Icon for " + dev.name);
            deviceIconContainer.append(deviceIcon);
            panelBody.append(deviceIconContainer);
            const description = $('<p>').text(dev.description);
            panelBody.append(description);
            panel.append(panelBody);

            return deviceContainer[0];
        }
    });
});
