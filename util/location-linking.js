// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Tp = require('thingpedia');
const qs = require('qs');

const Config = require('../config');

const URL = 'http://open.mapquestapi.com/nominatim/v1/search.php'; // key=%s&format=jsonv2&accept-language=%s&limit=5&q=%s";
const FREE_URL = 'http://nominatim.openstreetmap.org/search/?'; //?format=jsonv2&accept-language=%s&limit=5&q=%s

module.exports = async function resolveLocation(locale, searchKey) {
    let url;
    if (Config.MAPQUEST_KEY)
        url = URL + '?key=' + Config.MAPQUEST_KEY + '&';
    else
        url = FREE_URL;

    const parsed = JSON.parse(await Tp.Helpers.Http.get(url + qs.stringify({
        format: 'jsonv2',
        'accept-language': locale,
        limit: 5,
        q: searchKey
    })));

    return parsed.map((result) => {
        return {
            latitude: Number(result.lat),
            longitude: Number(result.lon),
            display: result.display_name,
            canonical: result.display_name.toLowerCase().replace(/[,\s]+/g, ' '),
            rank: result.place_rank,
            importance: result.importance,
        };
    });
};
