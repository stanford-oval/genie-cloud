$(function() {
    var trainer = new (require('thingtalk-trainer'));

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
        trainer.thingpedia.getExamplesByKinds(chosen, 0).then(function(data) {
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
        }).done();
    }

    $('#more-suggestions').click(loadSuggestions);
    loadSuggestions();

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
        var json = a.attr('data-target-json');

        var editThingTalk = $('#edit-thingtalk')[0].checked;
        if (editThingTalk) {
            try {
                var tt = trainer.toThingTalk(JSON.parse(json));
                $('#thingtalk-editor').removeClass('hidden');
                $('#thingtalk-group').removeClass('has-error');
                $('#thingtalk-error').text('');
                $('#thingtalk').val(tt);
            } catch(e) {
                alert(e.message);
            }
        } else {
            $('#thingtalk-editor').addClass('hidden');
            trainer.learnJSON(json).then(function(data) {
                $('#results-container').hide();
                if (data.error)
                    console.log('Error in learning', data.error);
                else
                    $('#counter').text(String(counter()));
            });
        }
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

    function format(canonical) {
        return canonical.replace(/`` ((?:[^']|'[^'])+) ''/g, '“$1”');
    }

    const FAILED = '{"special":{"id":"tt:root.special.failed"}}';

    $('#form').submit(function(event) {
        event.preventDefault();

        trainer.handle($('#utterance').val()).then(function(candidates) {
            $('#results-container').show();
            var results = $('#results');
            results.empty();

            var prediction = predict(candidates);
            console.log('prediction', prediction);
            if (prediction === null || prediction.answer === FAILED) {
                $('#prediction').text('Sabrina is confused and does not know what to do.');
            } else if (prediction === DO_FALLBACK) {
                $('#prediction').text('Sabrina is somewhat confused. She needs your help!');
            } else {
                $('#prediction').text(format(prediction.canonical));
            }

            var previous = null;
            candidates.forEach(function(result) {
                if (previous === result.answer)
                    return;
                if (result.answer === FAILED)
                    return;
                previous = result.answer;
                var link = $('<a href="#">')
                    .text(format(result.canonical))
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
        }).done();
    });

    $('#done').click(function(event) {
        event.preventDefault();

        var tt = $('#thingtalk').val();
        trainer.learnThingTalk(tt).then(function(data) {
            $('#results-container').hide();
            $('#thingtalk-group').removeClass('has-error');
            $('#thingtalk-error').text('');
            if (data.error)
                console.log('Error in learning', data.error);
            else
                $('#counter').text(String(counter()));
        }).catch(function(e) {
            $('#thingtalk-group').addClass('has-error');

            var err;
            if (typeof e === 'string') {
                err = e;
            } else if (e.name === 'SyntaxError') {
                if (e.location)
                    err = "Syntax error at line " + e.location.start.line + " column " + e.location.start.column + ": " + e.message;
                else
                    err = "Syntax error at " + e.fileName + " line " + e.lineNumber + ": " + e.message;
            } else if (e.message) {
                err = e.message;
            } else {
                err = String(e);
            }

            $('#thingtalk-error').text(err);
        });
    });
});
