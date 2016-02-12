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
