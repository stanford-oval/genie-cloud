ALTER TABLE `users` ADD `email_verified` tinyint(1) NOT NULL DEFAULT 0 AFTER `email`;
UPDATE `users` SET `email_verified` = 1 WHERE `developer_org` IS NOT NULL OR (`username` = `email` AND `google_id` IS NOT NULL);
