$(function() {
    $('.form-delete-user').on('submit', function() {
        return confirm("Are you 100% sure you want to delete this user?");
    });

    $('.button-send-message').on('click', function() {
        var self = $(this);

        if (self.attr('data-has-assistant') !== '1') {
            alert("Sorry, you can't message this user: he has no assistant.");
            return;
        }

        $('#form-message-user').attr('action', '/admin/message-user/' + self.attr('data-user-id'));
        $('#modal-message-user').modal();
    });

    $('#button-send-broadcast').on('click', function() {
        $('#form-message-user').attr('action', '/admin/message-broadcast');
        $('#modal-message-user').modal();
    });
});
