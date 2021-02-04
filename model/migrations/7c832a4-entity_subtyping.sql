ALTER TABLE `entity_names`
  ADD `subtype_of` varchar(64) COLLATE utf8_bin DEFAULT NULL;

ALTER TABLE `entity_names_snapshot`
  ADD `subtype_of` varchar(64) COLLATE utf8_bin DEFAULT NULL;
