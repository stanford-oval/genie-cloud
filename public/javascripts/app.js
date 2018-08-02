$(function() {
    $('.fa-heart').click(function(event) {
        let icon = $('#' + this.id);

        let count = $('#count' + this.id);
        let current = Number(count.text());

        if (icon.hasClass('far')) {
            icon.removeClass('far').addClass('fas');
            $.post('/app/upvote/' + this.id, '_csrf=' + $(this).attr('_csrf'));
            count.text(current + 1);
        } else {
            icon.removeClass('fas').addClass('far');
            $.post('/app/downvote/' + this.id, '_csrf=' + $(this).attr('_csrf'));
            count.text(current - 1);
        }
    });
});
