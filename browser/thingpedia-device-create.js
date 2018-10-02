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
require('codemirror/mode/javascript/javascript');
require('codemirror/addon/lint/lint');
require('codemirror/addon/lint/javascript-lint');
require('codemirror/addon/lint/json-lint');

$(() => {
    $('#device-code').each(function() {
         CodeMirror.fromTextArea(this, { mode: 'application/json',
                                         tabSize: 8,
                                         lineNumbers: true,
                                         gutters: ["CodeMirror-lint-markers"],
                                         lint: true
                                       });
    });
    $('#device-dataset').each(function() {
         CodeMirror.fromTextArea(this, { mode: 'application/x-thingtalk',
                                         tabSize: 8,
                                         lineNumbers: true,
                                         gutters: ["CodeMirror-lint-markers"],
                                         lint: true
                                       });
    });
});
