DROP TABLE IF EXISTS `template_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `template_files` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `tag` varchar(64) COLLATE utf8_bin,
  `owner` int(11) NOT NULL,
  `description` text CHARACTER SET utf8 NOT NULL,
  `flags` text COLLATE utf8_bin NOT NULL,
  `public` boolean NOT NULL DEFAULT true,
  `version` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`language`, `tag`),
  KEY `owner` (`owner`),
  CONSTRAINT `template_files_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `models` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `tag` varchar(64) COLLATE utf8_bin,
  `owner` int(11) NOT NULL,
  `access_token` char(64) COLLATE utf8_bin NULL,
  `template_file` int(11) NOT NULL,
  `flags` text COLLATE utf8_bin NOT NULL,
  `all_devices` boolean NOT NULL DEFAULT false,
  `use_approved` boolean NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`language`, `tag`),
  KEY `owner` (`owner`),
  CONSTRAINT `models_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `models_ibfk_2` FOREIGN KEY (`template_file`) REFERENCES `template_files` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `model_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `model_devices` (
  `model_id` int(11) NOT NULL,
  `schema_id` int(11) NOT NULL,
  PRIMARY KEY (`model_id`, `schema_id`),
  KEY `schema_id` (`schema_id`),
  CONSTRAINT `model_devices_ibfk_1` FOREIGN KEY (`schema_id`) REFERENCES `device_schema` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;
