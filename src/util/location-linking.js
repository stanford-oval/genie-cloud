// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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


import * as Tp from 'thingpedia';
import * as qs from 'qs';
import * as addressFormatter from '@fragaria/address-formatter';

import * as I18n from './i18n';

import * as Config from '../config';

const URL = 'http://open.mapquestapi.com/nominatim/v1/search.php'; // key=%s&format=jsonv2&accept-language=%s&limit=5&q=%s";
const FREE_URL = 'http://nominatim.openstreetmap.org/search/?'; //?format=jsonv2&accept-language=%s&limit=5&q=%s

export default async function resolveLocation(locale = 'en-US', searchKey, around) {
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

    const tokenizer = I18n.get(locale).genie.getTokenizer();
    return parsed.map((result) => {
        const addressKeys = Object.keys(result.address);
        const firstKey = addressKeys[0];

        // format the address, then pick only the first line or first two lines
        const formatted = addressFormatter.format(result.address, {
            abbreviate: false,
            output: 'array'
        });
        let display = formatted.slice(0, result.place_rank > 20 /* neighborhood */ ? 2 : 1).join(', ');
        // prepend the neighborhood if that's what the user is looking for, because addressFormatter
        // doesn't include it
        if (firstKey === 'neighbourhood' || firstKey === 'city_district')
            display = (result.address.neighbourhood || result.address.city_district) + ', ' + display;

        return {
            latitude: Number(result.lat),
            longitude: Number(result.lon),
            display: display,
            canonical: tokenizer.tokenize(display).rawTokens.join(' '),
            full_name: result.display_name,
            rank: Number(result.place_rank),
            importance: result.importance,
            address: result.address
        };
    });
}
