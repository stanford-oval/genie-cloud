$(function() {
    $('#app-install-form').on('submit', function() {
        var params = {};
        $('.app-param').each(function() {
            var self = $(this);
            params[self.attr('data-param')] = self.val();
        });
        console.log(JSON.stringify(params));
        $('#app-input-params').val(JSON.stringify(params));
    });
});
