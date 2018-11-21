"use strict";
$(function() {
    $('#docsearch-input').on('input', function() {
        var q = $('#docsearch-input').val();
        
        var container = $('#docsearch-results');
        if (!q) {
            container.empty();
            return;
        }
            
        $.ajax('/thingpedia/developers/search', { data: { q: q } }).then(function(results) {
            container.empty();
            results.data.forEach(function(result) {
                var item = $('<a>').addClass('list-group-item').attr('href', result.url).html('<span>' + result.highlight + '</span>');
                container.append(item);
            });
        });
    });
});
