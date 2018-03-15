// TODO: 
//  - two synthetic sentences per program for turkers
//  - add description to devices
//  - color the sentences

$(document).ready(function() { 
    let checked = {};
    for (let i = 1; i < 4; i ++) 
        for (let j = 1; j < 3; j ++) 
            checked[`paraphrase${i}-${j}`] = false;

    $('.paraphrase').focusout(function() {
        let syntheticId = 'synthetic' + $(this).attr('id').substring('paraphrase'.length, 'paraphrasex'.length);
        let synthetic = $('#' + syntheticId).text();
        let paraphraseId = $(this).attr('id');
        let paraphrase = $(this).val();
        let warningId = 'warning' + paraphraseId.substring('paraphrase'.length);
        if (paraphrase.length > 0) {
            check(synthetic, paraphrase).then(function(res) {
                checked[paraphraseId] = res === 'passed'; 
                console.log(checked);
                if (res === 'passed') {
                    $('#' + warningId).prop('hidden', true);
                    if (allChecked(checked)) {
                        $('#submit').prop('disabled', false);
                        $('#submit-warning').prop('hidden', true);
                    } else {
                        $('#submit').prop('disabled', true);
                        $('#submit-warning').prop('hidden', false);
                    }
                } else {
                    $('#' + warningId).text(res);
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
        for (let es in entities_synthetic) {
            let found = false;
            for (let ep in entities_paraphrase)
                if (ep.substring(0, ep.length - 1) === es.substring(0, es.length - 1))
                    if (equal(entities_paraphrase[ep], entities_synthetic[es]))
                        found = true;
            if (!found)
                return `Cannot find ${value(entities_synthetic[es])} in your paraphrase.`
        }
        for (let ep in entities_paraphrase) {
            let found = false;
            for (let es in entities_synthetic)
                if (ep.substring(0, ep.length - 1) === es.substring(0, es.length - 1))
                    if (equal(entities_paraphrase[ep], entities_synthetic[es]))
                        found = true;
            if (!found)
                return `Detect ${value(entities_paraphrase[ep])} in your paraphrase which not in the original sentence.`
        }
        return 'passed';
    });
}

function equal(entity1, entity2) {
    if (typeof entity1 !== typeof entity2)
        return false;
    let type = typeof entity1;
    if (type === 'string') 
        return entity1 === entity2;
    if ('latitude' in entity1 && 'longitude' in entity1) 
        return entity1.latitude === entity2.latitude && entity1.longitude === entity2.longitude;
    if ('value' in entity1)
        return entity1.value === entity2.value;
    return false;
}

function value(entity) {
    if (typeof entity === "string")
        return entity;
    if ('value' in entity)
        return entity.value;
    if ('display' in entity)
        return entity.display;
}

function allChecked(checked) {
    for (let p in checked) {
        if (!checked[p])
            return false;
    }
    return true;
}