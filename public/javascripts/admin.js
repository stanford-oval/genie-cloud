"use strict";
$(() => {
    $('.form-delete-user').on('submit', () => {
        return confirm("Are you 100% sure you want to delete this user?");
    });
});
