// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const minidom = require('./minidom');

function getCsrfToken(htmlString) {
    const [body] = minidom.getElementsByTagName(minidom.parse(htmlString), 'body');
    return minidom.getAttribute(body, 'data-csrf-token');
}

module.exports = { getCsrfToken };
