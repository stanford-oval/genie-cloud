// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

module.exports = function(hljs) {
  let KEYWORDS = {
    keyword: 
      'let join edge monitor new as of in out req opt ' + 
      'class extends dataset mixin this import null enum query action stream from language'
    ,
    literal:
      'true false loader config',
    built_in:
      'monitorable list now notify return',
  };
  let NUMBER = {
    className: 'number',
    variants: [
      { begin: '\\b(0[bB][01]+)' },
      { begin: '\\b(0[oO][0-7]+)' },
      { begin: hljs.C_NUMBER_RE }
    ],
    relevance: 0
  };

  return {
    keywords: KEYWORDS,
    contains: [
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBER,
      {
        className: 'symbol', 
        begin: /@/,
        end: /[\s(]/,
        excludeEnd: true
      },
      {
        className: 'type',
        begin: /(Measure|Enum|Boolean|String|Number|Currency|Location|Date|Time|Type|Array|Any|Table|Stream|ArgMap|Entity)(?![A-Za-z0-9_])/
      },
      {
        className: 'type',
        begin: /(Entity)(\s*\()(tt)(:)([A-Za-z_][A-Za-z0-9_]*)(\))/
      }
    ]
  };
};
