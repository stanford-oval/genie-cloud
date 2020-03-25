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

module.exports = async function resolveLocation(locale = 'en-US', searchKey, around) {
    let url;
    if (Config.MAPQUEST_KEY)
        url = URL + '?key=' + Config.MAPQUEST_KEY + '&';
    else
        url = FREE_URL;

    const data = {
        format: 'jsonv2',
        'accept-language': locale,
        limit: 5,
        q: searchKey,
        addressdetails: '1'
    };
    if (around) {
        // round to 1 decimal digit
        const lat = Math.round(around.latitude * 10) / 10;
        const lon = Math.round(around.longitude * 10) / 10;

        data.viewbox = [lon-0.1, lat-0.1, lon+0.1, lat+0.1].join(',');
    }

    const parsed = JSON.parse(await Tp.Helpers.Http.get(url + qs.stringify(data)));

    return parsed.map((result) => {
        const addressKeys = Object.keys(result.address);
        const firstKey = addressKeys[0];
        let display;
        if (firstKey === 'city') {
            if (result.address.state)
                display = result.address.city + ', ' + result.address.state;
            else
                display = result.address.city;
        } else {
            if (result.address.city)
                display = result.address[firstKey] + ', ' + result.address.city;
            else
                display = result.address[firstKey];
        }

        return {
            latitude: Number(result.lat),
            longitude: Number(result.lon),
            display: display,
            canonical: display.toLowerCase().replace(/[,\s]+/g, ' '),
            full_name: result.display_name,
            rank: Number(result.place_rank),
            importance: result.importance,
            address: result.address
        };
    });
};
