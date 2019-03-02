ALTER TABLE `models`
    ADD `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en' FIRST,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY(`language`, `tag`),
    ADD `owner` int(11) NOT NULL AFTER `tag`,
    ADD `access_token` char(64) COLLATE utf8_bin NULL AFTER `owner`,
    ADD KEY `owner` (`owner`),
    ADD CONSTRAINT `models_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON UPDATE CASCADE
;
UPDATE `models` SET `owner` = 1;
