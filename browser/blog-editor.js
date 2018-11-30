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
require('codemirror/mode/markdown/markdown');

const markdown = require('markdown-it');

$(() => {
    const cm = CodeMirror.fromTextArea(document.querySelector('#blog-source'), {
        mode: 'markdown',
        tabSize: 8,
        indentUnit: 4,
        lineWrapping: true,
        gutters: []
    });

    $('#blog-preview-button').click((event) => {
        event.preventDefault();

        const md = new markdown();
        md.use(require('markdown-it-anchor'));
        md.use(require('markdown-it-highlightjs'));
        md.use(require('markdown-it-container-pandoc'));
        md.use(require('markdown-it-footnote'));
        md.use(require('markdown-it-table-of-contents'), { includeLevel: [2,3] });

        const title = $('#blog-title').val();
        const source = cm.getValue();

        const rendered = md.render(source);
        $('#blog-preview-body').html(rendered);
        $('#blog-preview-title').text(title);

        $('#blog-preview').modal('show');
    });
});
