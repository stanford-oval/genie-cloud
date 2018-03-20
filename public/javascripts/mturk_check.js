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
    if (paraphrase.toLowerCase().replace(/\./g, '').trim() === 'no idea') 
        return Promise.resolve('passed');
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
        let counts = {};
        let countp = {};
        for (let es in entities_synthetic) {
            let found = false;
            let v = value(es, entities_synthetic[es]);
            for (let ep in entities_paraphrase)
                if (ep.substring(0, ep.length - 1) === es.substring(0, es.length - 1))
                    if (equal(entities_paraphrase[ep], entities_synthetic[es])) {
                        found = true;
                        if (!(v in counts))
                            counts[v] = 0;
                        counts[v] ++;
                        break;
                    }
            if (!found)
                return `Cannot find ${v} in your paraphrase.`
        }
        for (let ep in entities_paraphrase) {
            console.log(entities_paraphrase[ep])
            let found = false;
            let v = value(ep, entities_paraphrase[ep]);
            for (let es in entities_synthetic)
                if (ep.substring(0, ep.length - 1) === es.substring(0, es.length - 1))
                    if (equal(entities_paraphrase[ep], entities_synthetic[es])){
                        found = true;
                        if (!(v in countp))
                            countp[v] = 0;
                        countp[v] ++;
                        break;
                    }
            if (!found)
                return `${v} detected in your paraphrase which is not in the original sentence.`
        }
        if (Object.keys(entities_paraphrase).length !== Object.keys(entities_synthetic).length) {
            for (let v in counts) {
                if (counts[v] > countp[v])
                    return `Not enough ${v} in your paraphrase`;
                if (counts[v] < countp[v])
                    return `Too many ${v} in your paraphrase`;
            }
        }
        return 'passed';
    });
}

function equal(entity1, entity2) {
    if (typeof entity1 !== typeof entity2)
        return false;
    let type = typeof entity1;
    if (type === 'string' || type === 'number') 
        return entity1 === entity2;
    if ('year' in entity1)
        return entity1.year === entity2.year && entity1.month === entity2.month && entity1.day === entity2.day 
               && entity1.hour === entity2.hour && entity1.minute === entity2.minute && entity1.second === entity2.second;
    if ('hour' in entity1)
        return entity1.hour === entity2.hour && entity1.minute === entity2.minute;
    if ('latitude' in entity1 && 'longitude' in entity1) 
        return entity1.latitude === entity2.latitude && entity1.longitude === entity2.longitude;
    if ('unit' in entity1)
        return entity1.value === entity2.value && entity1.unit === entity2.unit;
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
    if (type.startsWith('NUMBER'))
        return `number ${entity}`;
    if (type.startsWith('CURRENCY'))
        return `"${entity.value} ${entity.unit}"`;
    if (type.startsWith('DURATION'))
        return `"${entity.value} ${entity.unit}"`;
    if (type.startsWith('DATE')) {
        let month_names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let year = entity.year === -1 ? '' : ` ${entity.year}`;
        let month = entity.month === -1 ? '' : ` ${month_names[entity.month]}`;
        let day = entity.day === -1 ? '' : ` ${entity.day}`;
        return `date${month}${day}${year}`;
    }
    if (type.startsWith('TIME')) {
        let minute = entity.minute;
        if (entity.minute < 10)
            minute = `0${entity.minute}`;
        return `time ${entity.hour}:${minute}`;
    }
    if (typeof entity === 'string')
        return `"${entity}"`;
    if (typeof entity === 'number')
        return `number ${entity}`;
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
