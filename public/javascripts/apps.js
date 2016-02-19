$(function() {
    $(window).load(function() {
        $('#share-app-dialog').modal('show');
    });

    $('.form-delete-app').on('submit', function() {
        return confirm("Are you sure?");
    });

    $('.button-delete-thingpedia-app').on('click', function() {
        var self = $(this);
        $('#delete-thingpedia-app-form')
        .attr('action', '/thingpedia/apps/delete/' +
              self.attr('data-app-id'));
        $('#delete-thingpedia-app-dialog').modal();
    });
});
