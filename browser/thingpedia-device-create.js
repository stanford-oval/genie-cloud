// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const CodeMirror = require('codemirror');

$(function() {
    $('#device-code').each(function() {
         CodeMirror.fromTextArea(this, { mode: 'application/json',
                                         tabSize: 8,
                                         lineNumbers: true,
                                         gutters: ["CodeMirror-lint-markers"],
                                         lint: true
                                       });
    });
});
