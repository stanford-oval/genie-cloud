// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
