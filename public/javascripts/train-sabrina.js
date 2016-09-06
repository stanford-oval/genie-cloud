$(function() {
    var SEMPRE_URL = 'https://pepperjack.stanford.edu';

    function invocationFromJson(json) {
        var parsed = JSON.parse(json);
        if (parsed.action)
            return parsed.action.name.id;
        else if (parsed.trigger)
            return parsed.trigger.name.id;
        else if (parsed.query)
            return parsed.query.name.id;
        else
            return 'unknown';
    }
    function loadSuggestions() {
        // choose 5 kinds at random
        var chosen = [];
        for (var i = 0; i < 5; i++)
            chosen.push(THINGPEDIA_KINDS[Math.floor(Math.random() * THINGPEDIA_KINDS.length)]);

        // query the server for the examples
        $.getJSON('/thingpedia/api/examples?base=0&key=' + chosen.join('+'), function(data) {
            var filtered = [];
            var invocations = {};

            console.log('data', data);

            if (data.length < 5) {
                filtered = data;
            } else {
                // pick 5 different examples
                var attempts = 0;
                while (filtered.length < 5 && attempts < 1000) {
                    attempts++;
                    var next = data[Math.floor(Math.random() * data.length)];
                    var invocation = invocationFromJson(next.target_json);
                    if (invocation in invocations)
                        continue;
                    invocations[invocation] = true;
                    filtered.push(next);
                }
            }

            var placeholder = $('#suggestions-placeholder');
            console.log('placeholder', placeholder);
            placeholder.empty();
            filtered.forEach(function(f) {
                placeholder.append($('<li>').text(f.utterance));
            });
        });
    }

    $('#more-suggestions').click(loadSuggestions);
    loadSuggestions();

    var sessionId = undefined;
    var utterance = undefined;

    function counter() {
        var v = localStorage.getItem('counter') || 0;
        v++;
        localStorage.setItem('counter', v);
        return v;
    }
    $('#counter').text(localStorage.getItem('counter') || 0);

    var locale = $('#language').text();

    function accept(event) {
        event.preventDefault();

        var a = $(this);
        var url = SEMPRE_URL + '/learn?locale=' + locale;
        url += '&sessionId=' + sessionId;
        url += '&q=' + encodeURIComponent(utterance);
        url += '&target=' + encodeURIComponent(a.attr('data-target-json'));

        $.getJSON(url, function(data) {
            $('#results-container').hide();
            if (data.error)
                console.log('Error in learning', data.error);
            else
                $('#counter').text(String(counter()));
        });
    }
    // we can't train on a fully negative example, so we just do nothing
    function rejectAll(event) {
        event.preventDefault();
        $('#results-container').hide();
        $('#counter').text(String(counter()));
    }


    var DO_FALLBACK = {};
    // this function implements the heuristics sabrina has on the client side
    // to pick up a good prediction
    function predict(candidates) {
        var choice = null;
        var fallbacks = [];

        if (candidates.length === 0) {
            console.log('Failed to analyze message (no candidate parses)');
            return null;
        } else {
            var effectiveProb = 0;
            var top = candidates[0];

            for (var candidate of candidates) {
                if (candidate.answer === top.answer)
                    effectiveProb += candidate.prob;
                else
                    break;
            }
            if (effectiveProb > 0.9) {
                choice = top;
            } else if (effectiveProb > 0.5 && candidates[0].score >= 0) {
                choice = top;
            } else {
                fallbacks = [];
                for (var candidate of candidates) {
                    if (fallbacks.length >= 5)
                        break;
                    if (candidate.prob < 0.15 || candidate.score < -10)
                        break;
                    fallbacks.push(candidate);
                }

            }
        }

        if (choice != null)
            return choice;
        if (fallbacks.length > 0)
            return DO_FALLBACK;
        else
            return null;
    }

    function format(canonical, utterance) {
        if (canonical === 'failuretoparse')
            return 'Search for “' + utterance + '” on the web';
        else
            return canonical.replace(/`` ((?:[^']|'[^'])+) ''/g, '“$1”');
    }

    $('#form').submit(function(event) {
        event.preventDefault();

        utterance = $('#utterance').val();

        var url = SEMPRE_URL + '/query?locale=' + locale + '&long=1';
        if (sessionId)
            url += '&sessionId=' + sessionId;
        url += '&q=' + encodeURIComponent(utterance);
        $.getJSON(url, function(data) {
            sessionId = data.sessionId;
            $('#results-container').show();
            var results = $('#results');
            results.empty();

            var prediction = predict(data.candidates);
            console.log('prediction', prediction);
            if (prediction === null || prediction.answer === '{"special":{"id":"tt:root.special.failed"}}') {
                $('#prediction').text('Sabrina is confused. She searches for “' + utterance + '” on the web.');
            } else if (prediction === DO_FALLBACK) {
                $('#prediction').text('Sabrina is somewhat confused. She needs your help!');
            } else {
                $('#prediction').text(format(prediction.canonical));
            }

            var previous = null;
            data.candidates.forEach(function(result) {
                if (previous === result.answer)
                    return;
                previous = result.answer;
                var link = $('<a href="#">')
                    .text(format(result.canonical, utterance))
                    .addClass('result')
                    .attr('data-target-json', result.answer)
                    .click(accept);
                results.append($('<li>').append(link));
            });
            var link = $('<a href="#">')
                    .text('None of the above')
                    .addClass('result')
                    .click(rejectAll);
            results.append($('<li>').append(link));
        });
    });
});
