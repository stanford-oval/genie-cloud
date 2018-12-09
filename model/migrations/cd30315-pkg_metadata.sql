ALTER TABLE `device_class` ADD `license` text COLLATE utf8_bin AFTER `description`,
  ADD `license_gplcompatible` boolean AFTER `license`,
  ADD `website` text COLLATE utf8_bin AFTER `license_gplcompatible`,
  ADD `repository` text COLLATE utf8_bin AFTER `website`,
  ADD `issue_tracker` text COLLATE utf8_bin AFTER `repository`;

UPDATE `device_class` SET `license` = '', `license_gplcompatible` = false, `website` ='',
  `repository` = '', `issue_tracker` = '';

ALTER TABLE `device_class` MODIFY `license` text COLLATE utf8_bin NOT NULL,
  MODIFY `license_gplcompatible` boolean NOT NULL,
  MODIFY `website` text COLLATE utf8_bin NOT NULL,
  MODIFY `repository` text COLLATE utf8_bin NOT NULL,
  MODIFY `issue_tracker` text COLLATE utf8_bin NOT NULL;