UPDATE `users` SET `model_tag` = NULL WHERE `model_tag` IN
    ('default', 'org.thingpedia.models.default', 'org.thingpedia.models.contextual',
     'org.thingpedia.models.developer', 'org.thingpedia.models.developer.contextual');
