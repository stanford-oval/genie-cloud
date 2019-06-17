"use strict";
$(function() {
    $('#doc-search-icon').click(function(event) {
        $('#doc-search-modal').modal('show');
        event.stopPropagation();
    });

    $('#docsearch-input').on('input', function() {
        var q = $('#docsearch-input').val();
        
        var container = $('#docsearch-results');
        if (!q) {
            container.empty();
            return;
        }
            
        $.ajax('/doc/search', { data: { q: q } }).then(function(results) {
            container.empty();
            results.data.forEach(function(result) {
                var item = $('<a>').addClass('list-group-item').attr('href', result.url).html('<span>' + result.highlight + '</span>');
                container.append(item);
            });
            $('.list-group-item').click(function() {
                $('#doc-search-modal').modal('hide');
            });
        });
    });
});

$(document).keypress(function(e) {
    if (e.keyCode === 27)
        $('#doc-search-modal').modal('hide');
});
