$(function() {
    $('.form-delete-device').on('submit', function() {
        return confirm("Are you sure?");
    });

    $('.upvote-btn').click(function() {
        $.post('/thingpedia/examples/upvote/' + $(this).attr('data-example-id'), '_csrf=' + $(this).attr('data-csrfToken'));
    });

    $('.downvote-btn').click(function() {
        $.post('/thingpedia/examples/downvote/' + $(this).attr('data-example-id'), '_csrf=' + $(this).attr('data-csrfToken'));
    });

    $('.hide-example-btn').click(function() {
        $.post('/thingpedia/examples/hide/' + $(this).attr('data-example-id'), '_csrf=' + $(this).attr('data-csrfToken'));
    });

    $('.delete-example-btn').click(function() {
        $.post('/thingpedia/examples/delete/' + $(this).attr('data-example-id'), '_csrf=' + $(this).attr('data-csrfToken'));
    });
});
