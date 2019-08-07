// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

function validatePageAndSize(req, defaultValue, maxValue) {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    else
        page = parseInt(page);
    if (!isFinite(page) || page < 0)
        page = 0;
    let page_size = req.query.page_size;
    if (page_size === undefined)
        page_size = defaultValue;
    else
        page_size = parseInt(page_size);
    if (!isFinite(page_size) || page_size < 0)
        page_size = defaultValue;
    if (page_size > maxValue)
        page_size = maxValue;
    return [page, page_size];
}

module.exports = {
    validatePageAndSize
};
