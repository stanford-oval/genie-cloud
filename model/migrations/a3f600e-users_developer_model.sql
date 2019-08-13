UPDATE `users` set `model_tag` = 'org.thingpedia.models.developer' where model_tag is null and developer_org is not null;
