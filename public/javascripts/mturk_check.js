// TODO: 
//  - two synthetic sentences per program for turkers
//  - add description to devices
//  - color the sentences

$(document).ready(function() { 
    let checked = {};
    for (let i = 1; i < 5; i ++) {
        for (let j = 1; j < 3; j ++) {
            checked[`paraphrase${i}-${j}`] = false;
            let hint = genHint($(`#hint${i}`).text());
            if (hint.length > 1) {
                $(`#hint${i}`).text('Hint: the command uses ' + hint);
                $(`#hint${i}`).prop('hidden', false);
            }
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
        let counts = {};
        let countp = {};
        for (let es in entities_synthetic) {
            let found = false;
            let v = value(es, entities_synthetic[es]);
            for (let ep in entities_paraphrase)
                if (ep.substring(0, ep.length - 1) === es.substring(0, es.length - 1))
                    if (equal(entities_paraphrase[ep], entities_synthetic[es])) {
                        found = true;
                        if (!(v in countp))
                            countp[v] = 0;
                        countp[v] ++;
                    }
            if (!found)
                return `Cannot find ${v} in your paraphrase.`
        }
        for (let ep in entities_paraphrase) {
            let found = false;
            let v = value(ep, entities_paraphrase[ep]);
            for (let es in entities_synthetic)
                if (ep.substring(0, ep.length - 1) === es.substring(0, es.length - 1))
                    if (equal(entities_paraphrase[ep], entities_synthetic[es])){
                        found = true;
                        if (!(v in counts))
                            counts[v] = 0;
                        counts[v] ++;
                    }
            if (!found)
                return `Detect ${v} in your paraphrase which is not in the original sentence.`
        }
        if (Object.keys(entities_paraphrase).length !== Object.keys(entities_synthetic).length) {
            for (let v in counts) {
                if (counts[v] > countp[v])
                    return `Not enough ${v} in your paraphrase`;
                if (counts[v] < countp[v])
                    return `Too many of ${v} in your paraphrase`;
            }
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

function value(type, entity) {
    if (type.startsWith('QUOTED_STRING'))
        return `"${entity}"`;
    if (type.startsWith('USERNAME'))
        return `@${entity}`;
    if (type.startsWith('HASHTAG'))
        return `#${entity}`;
    if (type.startsWith('LOCATION'))
        return `location: "${entity.display}"`;
    if (typeof entity === "string")
        return `"${entity}"`;
    if ('display' in entity)
        return `"${entity.display}"`;
    if ('value' in entity)
        return `"${entity.value}"`;
    return entity;
}

function allChecked(checked) {
    for (let p in checked) {
        if (!checked[p])
            return false;
    }
    return true;
}

function genHint(code) {
    console.log(code);
    let hint = [];
    let descriptions = {
        '@com.bing': 'Bing search engine', 
        '@com.giphy': 'Giphy, a website for GIF images',
        '@com.github': 'Github, a website for programmers to keep track of their code',
        '@com.xkcd': 'XKCD, a webcomic',
        '@com.live.onedrive': 'OneDrive, a cloud storage from Microsoft',
        '@com.google.drive': 'Google Drive, a cloud storage from Google',
        'light-bulb': 'Philips Hue, a smart light bulb',
        '@com.lg.tv': 'an LG television which uses webOS as its operating system',
        'security-camera': 'Nest security camera',
        'thermostat': 'Nest smart thermostat',
        '@com.parklonamerica.heatpad': 'a heating pad',
        '@com.phdcomics': 'PhDComics, a webcomic that follows the lives of several grad students',
        '@com.slack': 'Slack, a messaging app for teams',
        '@com.tesla': 'a Tesla car which can be controlled remotely',
        '@edu.stanford.rakeshr1.fitbit': 'Fitbit, an activity tracker',
        '@org.thingpedia.builtin.omlet': 'Omlet, a messaging app similar to WhatsApp',
        '@com.twitter': 'Twitter',
        '@com.instagram': 'Instagram'
    }
    for (let device in descriptions) {
        if (code.indexOf(device) > -1)
            hint.push(descriptions[device]);
    }
    return hint.join(', and ') + '.'
}