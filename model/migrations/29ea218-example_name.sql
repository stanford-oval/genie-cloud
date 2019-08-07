ALTER TABLE `example_utterances`
    ADD `name` varchar(128) COLLATE utf8_bin DEFAULT NULL,
    ADD UNIQUE KEY `intent_name` (`language`, `schema_id`, `name`);
