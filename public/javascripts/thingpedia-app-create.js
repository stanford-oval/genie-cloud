$(function() {
    var tagCounter = 0;

    $('.tag-remove').on('click', function() {
        $($(this).attr('data-target')).remove();
    });

    tagCounter = $('.input-tag').length;

    $('#add-tag-input').on('blur', function() {
        var text = $(this).val();
        if (!text)
            return;

        var id = 'tag-' + tagCounter++;
        var tag = $('<span>')
            .addClass('label label-default input-tag')
            .attr('id', id)
            .text(text + ' | ');
        var remove = $('<a>')
            .addClass('tag-remove')
            .append($('<span>').addClass('glyphicon-minus'))
            .on('click', function() {
                $('#' + id).remove();
            });
        var input = $('<input>')
            .attr('type', 'hidden')
            .attr('name', 'tags[]')
            .val(text);
        tag.append(remove);
        tag.append(input);
        $('#tag-container').append(' ').append(tag);
        $(this).val('');
    });
});
