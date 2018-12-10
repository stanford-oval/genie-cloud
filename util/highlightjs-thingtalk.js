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
  var NUMBER = {
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
        begin: /\@/,
        end: /[\s | \( ]/,
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