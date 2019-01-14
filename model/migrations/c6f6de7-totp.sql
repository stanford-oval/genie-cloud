ALTER TABLE `users` ADD `totp_key` varchar(128) COLLATE utf8_bin DEFAULT NULL AFTER `salt`;
