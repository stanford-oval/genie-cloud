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

function stringEscape(str) {
    if (str === null || str === undefined)
        return 'null';
    return '"' + str.replace(/(["\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
    // the following comment fixes broken syntax highlighting in GtkSourceView
    //]/
}

module.exports = {
    stringEscape
};
