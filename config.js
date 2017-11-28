// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

// The location where icons and zip files are stored
// This can be an absolute URI ending in cloudfront.net, which enables the
// S3 storage backend, or a relative URI
module.exports.S3_CLOUDFRONT_HOST = 'https://d1ge76rambtuys.cloudfront.net';
module.exports.THINGENGINE_MANAGER_ADDRESS = './control';
module.exports.THINGENGINE_DIRECT_ADDRESS = './direct';
module.exports.BING_KEY = '76e02e969871428196e80ecfb364bf65';

// set this to 'embedded' to enable the embedded Thingpedia,
// to 'external' to use the Thingpedia at THINGPEDIA_URL;
module.exports.WITH_THINGPEDIA = 'external';
// this is used to construct links to Thingpedia, eg from My Almond
// it MUST be empty if the embedded Thingpedia is to be used
module.exports.THINGPEDIA_URL = 'https://thingpedia.stanford.edu';
// set to true if this is serving https://thingpedia.stanford.edu
// (enables redirect from legacy domains and sets Strict-Transport-Security
// headers)
module.exports.IS_PRODUCTION_THINGPEDIA = false;
