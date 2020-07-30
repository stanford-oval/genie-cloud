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

    $('#blog-upload-file-button').click((event) => {
        event.preventDefault();

        $('#blog-upload-file-before-upload').show();
        $('#blog-upload-file-after-upload').hide();
        $('#blog-upload-file').modal('show');
    });

    $('#blog-upload-file-form').submit((event) => {
        event.preventDefault();

        const files = $('#blog-upload-file-input')[0].files;
        if (!files)
            return;

        const csrfToken = document.body.dataset.csrfToken;
        const formData = new FormData();
        formData.set('_csrf', csrfToken);
        formData.set('file', files[0]);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/admin/blog/upload', true);

        // action after uploading happens
        xhr.onload = function(e) {
            const response = xhr.responseText;
            const result = JSON.parse(response);
            console.log(result);

            $('#blog-upload-file-before-upload').hide();
            const afterUpload = $('#blog-upload-file-after-upload');
            const CDN_HOST = document.body.dataset.iconCdn;
            afterUpload.html(`
                <p><strong>Upload successful!</strong></p>
                <p>You can now include the image in your blog post with:</p>
                <pre><code>![Alt Text](${CDN_HOST}/blog-assets/${result.filename})</code></pre>
            `);
            afterUpload.show();

            console.log("File uploading completed!");
        };

        // do the uploading
        xhr.send(formData);
    });
});
