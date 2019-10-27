ALTER TABLE device_schema_channels
  ADD `extends` text COLLATE utf8_bin NULL AFTER `channel_type`;
