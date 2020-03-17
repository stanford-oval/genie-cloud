ALTER TABLE `models`
  ADD `config` MEDIUMTEXT COLLATE utf8_bin NOT NULL DEFAULT '{}' AFTER `use_exact`,
  ADD `trained_config` MEDIUMTEXT COLLATE utf8_bin DEFAULT NULL AFTER `metrics`;

ALTER TABLE `training_jobs`
  ADD `owner` int(11) NULL DEFAULT NULL,
  ADD FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT;
