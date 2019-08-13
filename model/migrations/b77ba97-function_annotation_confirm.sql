ALTER TABLE `device_schema_channels`
  ADD `confirm` tinyint(1) NOT NULL DEFAULT 1;
UPDATE `device_schema_channels` SET confirm = 0 WHERE `channel_type` = 'action';
