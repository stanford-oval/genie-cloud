// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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
