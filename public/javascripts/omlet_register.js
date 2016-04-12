(function() {
    function exitWithMsg(msg) {
        Omlet.exit({ type: 'text', data: { text: JSON.stringify(msg), hidden: true }});
    }

    $(function() {
        $('#register-form').on('submit', function(event) {
            event.preventDefault();
            var username = $('#username').val();
            var email = $('#email').val();
            if (!username || !email)
                return;
            var password = $('#password').val();
            if (!password || password.length < 8)
                return;
            var confirm = $('#confirm-password').val();
            if (password !== confirm)
                return;

            try {
                var random = new Uint8Array(32);
                window.crypto.getRandomValues(random);
                var hex = new Array(32);
                for (var i = 0; i < 32; i++) {
                    if (random[i] < 16)
                        hex[i] = '0' + random[i].toString(16);
                    else
                        hex[i] = random[i].toString(16);
                }
                var salt = hex.join('');

                var hash = Pbkdf2.pbkdf2Sync(password, salt, 10000, 32).toString('hex');
                exitWithMsg({ op: 'complete-registration',
                              username: username,
                              email: email,
                              salt: salt,
                              'password-hash': hash });
            } catch(e) {
                alert('Error: ' + e.message);
            }
        })
    })
})(); 
