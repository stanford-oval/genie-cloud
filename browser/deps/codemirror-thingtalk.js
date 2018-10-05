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

const ThingTalk = require('thingtalk');

const CodeMirror = require('codemirror');
require('codemirror/addon/mode/simple');

CodeMirror.defineSimpleMode('thingtalk', {
    start: [
        {regex: /(true|false|null|enum|this|\$undefined)(?![A-Za-z0-9_])/, token: "atom"},

        {regex: /\{/, indent: true },
        {regex: /\}/, dedent: true},

        {regex: /(new|as|of|in|out|req|opt|join|edge|aggregate|from)(?![A-Za-z0-9_])/, token: 'keyword' },
        {regex: /(let|class|dataset|import|extends|mixin)(?![A-Za-z0-9_])/, token: 'def' },
        {regex: /(now|monitor|notify)(?![A-Za-z0-9_])/, token: 'builtin' },

        {regex: /(\s*)(monitorable)(\s*)(list)(\s*)(query)(?![A-Za-z0-9_])/, token: [null, 'qualifier', null, 'qualifier', null, 'qualifier'], sol: true },
        {regex: /(\s*)(list)(\s*)(monitorable)(\s*)(query)(?![A-Za-z0-9_])/, token: [null, 'qualifier', null, 'qualifier', null, 'qualifier'], sol: true },
        {regex: /(\s*)(list|monitorable)(\s*)(query)(?![A-Za-z0-9_])/, token: [null, 'qualifier', null, 'qualifier'], sol: true },

        {regex: /(\s*)(query|action|stream|program)(?![A-Za-z0-9_])/, token: [null, 'qualifier'], sol: true },
        {regex: /(Entity)(\s*\()((?:[A-Za-z_][A-Za-z0-9_-]*\.)+[A-Za-z_][A-Za-z0-9_-]*)(:)([A-Za-z_][A-Za-z0-9_]*)(\))/,
        token: ['variable-3', null, 'variable-2', null, 'variable', null]},
        {regex: /(Entity)(\s*\()(tt)(:)([A-Za-z_][A-Za-z0-9_]*)(\))/,
        token: ['variable-3', null, 'builtin', null, 'variable', null]},
        {regex: /(Measure|Enum|Boolean|String|Number|Currency|Location|Date|Time|Type|Array|Any|Table|Stream|ArgMap)(?![A-Za-z0-9_])/, token: 'variable-3'},

        {regex: /"(?:[^\\]|\\.)*?(?:"|$)/, token: "string"},
        {regex: /'(?:[^\\]|\\.)*?(?:'|$)/, token: "string"},
        {regex: /[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?([A-Za-z_][A-Za-z0-9_]*)?/i, token: "number"},
        {regex: /\/\/.*/, token: "comment"},
        {regex: /\/\*/, token: "comment", next: "comment"},

        {regex: /@(?:[A-Za-z_][A-Za-z0-9_-]*\.)+[A-Za-z_][A-Za-z0-9_-]*/, token: 'variable-2' },
        {regex: /[A-Za-z_][A-Za-z0-9_]*/, token: 'variable' },

    ],

    // The multi-line comment state.
    comment: [
        {regex: /.*?\*\//, token: "comment", next: "start"},
        {regex: /.*/, token: "comment"}
    ],

    meta: {
        dontIndentStates: ["comment"],
        lineComment: '//'
    }

});

CodeMirror.registerHelper("lint", "thingtalk", (text) => {
    const found = [];
    try {
        ThingTalk.Grammar.parse(text);
    } catch(e) {
        if (e.name !== 'SyntaxError')
            throw e;
        found.push({
            from: CodeMirror.Pos(e.location.start.line-1, e.location.start.column-1),
            to: CodeMirror.Pos(e.location.end.line-1, e.location.end.column-1),
            message: e.message
        });
    }
    return found;
});

CodeMirror.defineMIME('application/x-thingtalk', 'thingtalk');
