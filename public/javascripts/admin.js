"use strict";
$(function() {
    $('.form-delete-user').on('submit', function() {
        return confirm("Are you 100% sure you want to delete this user?");
    });
});
