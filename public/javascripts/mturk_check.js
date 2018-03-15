// TODO: 
//  - two synthetic sentences per program for turkers
//  - add description to devices
//  - color the sentences

$(document).ready(function() { 
    let checked = {};
    let warnings = {};
    for (let i = 1; i < 4; i ++) {
        for (let j = 1; j < 3; j ++) {
            checked[`paraphrase${i}-${j}`] = false;
            warnings[`paraphrase${i}-${j}`] = 'Something is wrong with this paraphrase!'
        }
    }


    $('.paraphrase').focusout(function() {
        let syntheticId = 'synthetic' + $(this).attr('id').substring('paraphrase'.length, 'paraphrasex'.length);
        let synthetic = $('#' + syntheticId).text();
        let paraphraseId = $(this).attr('id');
        let paraphrase = $(this).val();
        let warningId = 'warning' + paraphraseId.substring('paraphrase'.length);
        if (paraphrase.length > 0) {
            check(synthetic, paraphrase).then(function(res) {
                checked[paraphraseId] = res; 
                console.log(checked);
                if (res) {
                    $('#' + warningId).prop('hidden', true);
                    if (allChecked(checked)) {
                        $('#submit').prop('disabled', false);
                        $('#submit-warning').prop('hidden', true);
                    } else {
                        $('#submit').prop('disabled', true);
                        $('#submit-warning').prop('hidden', false);
                    }
                } else {
                    $('#' + warningId).prop('hidden', false);
                    $('#submit').prop('disabled', true);
                    $('#submit-warning').prop('hidden', false);
                }
            });
        }
    });

    $('form').submit(function() {
        console.log('submitted')
        console.log($('form'))
        console.log($(this).serializeArray())
        alert("Thank you")
    })
});

function check(synthetic, paraphrase) {
    return $.when(
        $.ajax({
            type: 'GET',
            url: 'https://almond-nl.stanford.edu/en-us/tokenize',
            data: {
                q: synthetic
            },
            dataType: 'json',
            success: function(res) {entities_synthetic = res.entities;}
        }),
        $.ajax({
            type: 'GET',
            url: 'https://almond-nl.stanford.edu/en-us/tokenize',
            data: {
                q: paraphrase
            },
            dataType: 'json',
            success: function(res) {entities_paraphrase = res.entities;}
        }),
    ).then(function() {
        console.log(entities_paraphrase, entities_synthetic)
        return Object.keys(entities_synthetic).every(function(es) {
            return Object.keys(entities_paraphrase).some(function(ep) {
                if (ep.substring(0, ep.length - 1) === es.substring(0, es.length - 1))
                    if (equal(entities_paraphrase[ep], entities_synthetic[es]))
                        return true;
                return false;
            })
        });
    });
}

function equal(value1, value2) {
    if (typeof value1 !== typeof value2)
        return false;
    let type = typeof value1;
    if (type === 'string') 
        return value1 === value2;
    if ('latitude' in value1 && 'longitude' in value1) 
        return value1.latitude === value2.latitude && value1.longitude === value2.longitude;
    if ('value' in value1)
        return value1.value === value2.value;
    return false;
}

function allChecked(checked) {
    for (let p in checked) {
        if (!checked[p])
            return false;
    }
    return true;
}