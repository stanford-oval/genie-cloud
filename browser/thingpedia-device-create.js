// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const CodeMirror = require('codemirror');
require('codemirror/mode/javascript/javascript');
require('codemirror/addon/lint/lint');
require('codemirror/addon/lint/javascript-lint');
require('codemirror/addon/lint/json-lint');
require('./deps/codemirror-thingtalk');

$(() => {
    const codemirror = new Map;
    const MODES = {
        'device-code': 'application/x-thingtalk',
        'device-dataset': 'application/x-thingtalk'
    };
    function activateTab(tab) {
        if (!tab)
            return;
        const textarea = $(tab.getAttribute('href') + ' textarea.enable-codemirror')[0];
        if (!textarea)
            return;

        if (codemirror.has(textarea.id))
            return;

        const cm = CodeMirror.fromTextArea(textarea, {
            mode: MODES[textarea.id],
            tabSize: 8,
            indentUnit: 4,
            lineNumbers: true,
            gutters: ["CodeMirror-lint-markers"],
            lint: true
        });
        codemirror.set(textarea.id, cm);
    }

    $('#device-editor-sidebar').on('shown.bs.tab', (event) => {
        activateTab(event.target);
    });
    activateTab($('#device-editor-sidebar li.active > a')[0]);

    /*$('.tab-switcher a').click(function(event) {
        event.preventDefault();
        $('.tab-switcher a').removeClass('checked');
        $('.tab-container .tab').removeClass('selected');
        const a = $(this);
        a.addClass('checked');
        $(a.attr('href')).addClass('selected');
    });*/
});
