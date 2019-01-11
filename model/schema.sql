/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `background`
--

DROP TABLE IF EXISTS `background`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `background` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner` int(11) NOT NULL,
  `schema_id` int(11) DEFAULT NULL,
  `function_name` varchar(128) COLLATE utf8_bin DEFAULT NULL,
  `hash` char(32) COLLATE utf8_bin NOT NULL,
  `corner_colors` mediumtext COLLATE utf8_bin NOT NULL,
  `color_palette` mediumtext COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`id`),
  KEY `owner` (`owner`),
  KEY `schema_id` (`schema_id`,`function_name`),
  CONSTRAINT `background_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `background_ibfk_2` FOREIGN KEY (`schema_id`) REFERENCES `device_schema` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `background_rectangle`
--

DROP TABLE IF EXISTS `background_rectangle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `background_rectangle` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `background_id` int(11) NOT NULL,
  `coord_top` float NOT NULL,
  `coord_bottom` float NOT NULL,
  `coord_left` float NOT NULL,
  `coord_right` float NOT NULL,
  `label` varchar(255) COLLATE utf8_bin NOT NULL,
  `order_index` int(11) NOT NULL,
  `cover` tinyint(1) NOT NULL DEFAULT 0,
  `font_family` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `font_size` int(11) DEFAULT NULL,
  `font_color` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `text_align` enum('left','right','center','justify') COLLATE utf8_bin DEFAULT NULL,
  `color` varchar(255) COLLATE utf8_bin NOT NULL,
  `top_color` varchar(255) COLLATE utf8_bin NOT NULL,
  `bottom_color` varchar(255) COLLATE utf8_bin NOT NULL,
  `left_color` varchar(255) COLLATE utf8_bin NOT NULL,
  `right_color` varchar(255) COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`id`),
  KEY `background_id` (`background_id`),
  CONSTRAINT `background_rectangle_ibfk_1` FOREIGN KEY (`background_id`) REFERENCES `background` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `background_tag`
--

DROP TABLE IF EXISTS `background_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `background_tag` (
  `background_id` int(11) NOT NULL,
  `tag` varchar(255) COLLATE utf8_bin NOT NULL,
  `required` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`background_id`,`tag`),
  CONSTRAINT `background_tag_ibfk_1` FOREIGN KEY (`background_id`) REFERENCES `background` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `category`
--

DROP TABLE IF EXISTS `category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `category` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `catchphrase` varchar(255) CHARACTER SET utf8 NOT NULL,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `description` mediumtext CHARACTER SET utf8 NOT NULL,
  `tag` varchar(255) CHARACTER SET utf8 NOT NULL,
  `icon` varchar(255) COLLATE utf8_bin NOT NULL,
  `order_position` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `order_position` (`order_position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `command_suggestions`
--

DROP TABLE IF EXISTS `command_suggestions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `command_suggestions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `command` text CHARACTER SET utf8 NOT NULL,
  `suggest_time` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_class`
--

DROP TABLE IF EXISTS `device_class`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_class` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `primary_kind` varchar(128) COLLATE utf8_bin NOT NULL,
  `owner` int(11) NOT NULL,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `description` text CHARACTER SET utf8 NOT NULL,
  `license` text COLLATE utf8_bin NOT NULL,
  `license_gplcompatible` boolean NOT NULL,
  `website` text COLLATE utf8_bin NOT NULL,
  `repository` text COLLATE utf8_bin NOT NULL,
  `issue_tracker` text COLLATE utf8_bin NOT NULL,
  `source_code` mediumtext COLLATE utf8_bin NOT NULL,
  `colors_dominant` mediumtext COLLATE utf8_bin NOT NULL,
  `colors_palette_default` mediumtext COLLATE utf8_bin NOT NULL,
  `colors_palette_light` mediumtext COLLATE utf8_bin NOT NULL,
  `category` enum('physical','online','data','system') COLLATE utf8_bin NOT NULL DEFAULT 'physical',
  `subcategory` enum('service','media','social-network','communication','home','health','data-management') COLLATE utf8_bin NOT NULL DEFAULT 'service',
  `approved_version` int(11) DEFAULT NULL,
  `developer_version` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `primary_kind` (`primary_kind`),
  KEY `owner` (`owner`),
  KEY `category` (`category`),
  KEY `subcategory` (`subcategory`),
  CONSTRAINT `device_class_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_class_tag`
--

DROP TABLE IF EXISTS `device_class_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_class_tag` (
  `device_id` int(11) NOT NULL,
  `tag` varchar(255) COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`device_id`,`tag`),
  KEY `tag` (`tag`),
  CONSTRAINT `device_class_tag_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_class_kind`
--

DROP TABLE IF EXISTS `device_class_kind`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_class_kind` (
  `device_id` int(11) NOT NULL,
  `kind` varchar(128) COLLATE utf8_bin NOT NULL,
  `is_child` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`device_id`,`kind`),
  KEY `kind` (`kind`),
  CONSTRAINT `device_class_kind_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `device_class_kind_ibfk_2` FOREIGN KEY (`kind`) REFERENCES `device_schema` (`kind`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_discovery_services`
--

DROP TABLE IF EXISTS `device_discovery_services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_discovery_services` (
  `device_id` int(11) NOT NULL,
  `discovery_type` enum('bluetooth', 'upnp') COLLATE utf8_bin NOT NULL,
  `service` varchar(128) COLLATE utf8_bin NOT NULL DEFAULT 0,
  PRIMARY KEY (`device_id`,`discovery_type`,`service`),
  KEY `descriptor` (`discovery_type`,`service`),
  CONSTRAINT `device_discovery_descriptor_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_code_version`
--

DROP TABLE IF EXISTS `device_code_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_code_version` (
  `device_id` int(11) NOT NULL,
  `version` int(11) NOT NULL,
  `code` mediumtext COLLATE utf8_bin NOT NULL,
  `factory` mediumtext COLLATE utf8_bin NOT NULL,
  `downloadable` tinyint(1) NOT NULL DEFAULT 0,
  `module_type` varchar(64) COLLATE utf8_bin NOT NULL,
  `mtime` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`device_id`,`version`),
  CONSTRAINT `device_code_version_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_schema`
--

DROP TABLE IF EXISTS `device_schema`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_schema` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `kind` varchar(128) COLLATE utf8_bin NOT NULL,
  `kind_type` enum('primary','app','category','discovery','other') COLLATE utf8_bin NOT NULL DEFAULT 'other',
  `owner` int(11) DEFAULT 1,
  `developer_version` int(11) NOT NULL DEFAULT 0,
  `approved_version` int(11) DEFAULT NULL,
  `kind_canonical` varchar(128) CHARACTER SET utf8 NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `kind` (`kind`),
  KEY `owner` (`owner`),
  FULLTEXT KEY `kind_ft` (`kind_canonical`),
  CONSTRAINT `device_schema_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_schema_channel_canonicals`
--

DROP TABLE IF EXISTS `device_schema_channel_canonicals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_schema_channel_canonicals` (
  `schema_id` int(11) NOT NULL,
  `version` int(11) NOT NULL,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `name` varchar(128) COLLATE utf8_bin NOT NULL,
  `canonical` text CHARACTER SET utf8 NOT NULL,
  `confirmation` varchar(255) CHARACTER SET utf8 DEFAULT NULL,
  `confirmation_remote` varchar(255) CHARACTER SET utf8 DEFAULT NULL,
  `formatted` mediumtext CHARACTER SET utf8 DEFAULT NULL,
  `questions` mediumtext CHARACTER SET utf8 NOT NULL,
  `argcanonicals` mediumtext CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`schema_id`,`version`,`language`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_schema_channels`
--

DROP TABLE IF EXISTS `device_schema_channels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_schema_channels` (
  `schema_id` int(11) NOT NULL,
  `version` int(11) NOT NULL,
  `name` varchar(128) COLLATE utf8_bin NOT NULL,
  `channel_type` enum('trigger','action','query') COLLATE utf8_bin NOT NULL,
  `types` mediumtext COLLATE utf8_bin NOT NULL,
  `argnames` mediumtext COLLATE utf8_bin NOT NULL,
  `required` mediumtext COLLATE utf8_bin NOT NULL,
  `is_input` mediumtext COLLATE utf8_bin NOT NULL,
  `string_values` mediumtext COLLATE utf8_bin NOT NULL,
  `doc` mediumtext COLLATE utf8_bin NOT NULL,
  `is_list` tinyint(1) NOT NULL DEFAULT 1,
  `is_monitorable` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`schema_id`,`version`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_schema_snapshot`
--

DROP TABLE IF EXISTS `device_schema_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_schema_snapshot` (
  `snapshot_id` int(11) NOT NULL,
  `schema_id` int(11) NOT NULL,
  `kind` varchar(128) COLLATE utf8_bin NOT NULL,
  `kind_type` enum('primary','app','category','discovery','global','other') COLLATE utf8_bin NOT NULL DEFAULT 'other',
  `owner` int(11) DEFAULT 1,
  `developer_version` int(11) NOT NULL,
  `approved_version` int(11) DEFAULT NULL,
  `kind_canonical` varchar(128) COLLATE utf8_bin DEFAULT NULL,
  PRIMARY KEY (`snapshot_id`,`schema_id`),
  UNIQUE KEY `snapshot_id` (`snapshot_id`,`kind`),
  KEY `owner` (`owner`),
  CONSTRAINT `device_schema_snapshot_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `device_schema_snapshot_ibfk_2` FOREIGN KEY (`snapshot_id`) REFERENCES `snapshot` (`snapshot_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_schema_version`
--

DROP TABLE IF EXISTS `device_schema_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_schema_version` (
  `schema_id` int(11) NOT NULL,
  `version` int(11) NOT NULL,
  `types` mediumtext COLLATE utf8_bin NOT NULL,
  `meta` mediumtext COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`schema_id`,`version`),
  CONSTRAINT `device_schema_version_ibfk_1` FOREIGN KEY (`schema_id`) REFERENCES `device_schema` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entity_lexicon`
--

DROP TABLE IF EXISTS `entity_lexicon`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `entity_lexicon` (
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `entity_id` varchar(64) COLLATE utf8_bin NOT NULL,
  `entity_value` varchar(255) COLLATE utf8_bin NOT NULL,
  `entity_canonical` varchar(128) CHARACTER SET utf8 NOT NULL,
  `entity_name` varchar(128) CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`language`,`entity_id`,`entity_value`,`entity_canonical`),
  KEY `entity_id` (`entity_id`),
  FULLTEXT KEY `entity_canonical` (`entity_canonical`),
  CONSTRAINT `entity_lexicon_ibfk_1` FOREIGN KEY (`entity_id`) REFERENCES `entity_names` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entity_names`
--

DROP TABLE IF EXISTS `entity_names`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `entity_names` (
  `id` varchar(64) COLLATE utf8_bin NOT NULL,
  `language` char(15) COLLATE utf8_bin NOT NULL,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `is_well_known` tinyint(1) NOT NULL DEFAULT 0,
  `has_ner_support` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`,`language`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entity_names_snapshot`
--

DROP TABLE IF EXISTS `entity_names_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `entity_names_snapshot` (
  `snapshot_id` int(11) NOT NULL,
  `id` varchar(64) COLLATE utf8_bin NOT NULL,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `is_well_known` tinyint(1) NOT NULL DEFAULT 0,
  `has_ner_support` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`snapshot_id`,`id`,`language`),
  CONSTRAINT `entity_names_snapshot_ibfk_1` FOREIGN KEY (`snapshot_id`) REFERENCES `snapshot` (`snapshot_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `string_types`
--

DROP TABLE IF EXISTS `string_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `string_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `language` char(15) COLLATE utf8_bin NOT NULL,
  `type_name` varchar(255) COLLATE utf8_bin NOT NULL,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `license` enum('public-domain', 'free-permissive', 'free-copyleft', 'non-commercial', 'proprietary') COLLATE utf8_bin not null default 'public-domain',
  `attribution` mediumtext CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`language`, `type_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `string_values`
--

DROP TABLE IF EXISTS `string_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `string_values` (
  `type_id` int(11) NOT NULL,
  `value` text CHARACTER SET utf8mb4 NOT NULL,
  `preprocessed` text CHARACTER SET utf8mb4 NOT NULL,
  `weight` double not null default 1.0,
  KEY (`type_id`),
  CONSTRAINT `string_values_ibfk_1` FOREIGN KEY (`type_id`) REFERENCES `string_types` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `example_utterances`
--

DROP TABLE IF EXISTS `example_utterances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `example_utterances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `schema_id` int(11) DEFAULT NULL,
  `is_base` tinyint(1) NOT NULL DEFAULT 0,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `type` char(32) COLLATE utf8_bin NOT NULL DEFAULT 'other',
  `flags` set('synthetic','augmented','obsolete','ambiguous','template','training','exact') COLLATE utf8_bin NOT NULL DEFAULT '',
  `utterance` text CHARACTER SET utf8mb4 NOT NULL,
  `preprocessed` text CHARACTER SET utf8mb4 NOT NULL,
  `target_json` text COLLATE utf8_bin NOT NULL,
  `target_code` text COLLATE utf8mb4_bin NOT NULL,
  `click_count` int(11) NOT NULL DEFAULT 0,
  `like_count` int(11) NOT NULL DEFAULT 0,
  `owner` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `schema_id` (`schema_id`),
  KEY `language_type` (`language`,`type`),
  KEY `language_flags` (`language`,`flags`),
  KEY `owner` (`owner`),
  CONSTRAINT `example_utterances_ibfk_1` FOREIGN KEY (`schema_id`) REFERENCES `device_schema` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `example_utterances_ibfk_2` FOREIGN KEY (`owner`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `example_likes`
--

DROP TABLE IF EXISTS `example_likes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `example_likes` (
  `example_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  PRIMARY KEY (`example_id`, `user_id`),
  CONSTRAINT `example_likes_ibfk_1` FOREIGN KEY (`example_id`) REFERENCES `example_utterances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `example_likes_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `replaced_example_utterances`
--

DROP TABLE IF EXISTS `replaced_example_utterances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `replaced_example_utterances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `type` char(32) COLLATE utf8_bin NOT NULL DEFAULT 'other',
  `flags` set('synthetic','augmented','obsolete','ambiguous','template','training','exact') COLLATE utf8_bin NOT NULL DEFAULT '',
  `preprocessed` text CHARACTER SET utf8mb4 NOT NULL,
  `target_code` text COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`id`),
  KEY `language_type` (`language`,`type`),
  KEY `language_flags` (`language`,`flags`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mturk_batch`
--

DROP TABLE IF EXISTS `mturk_batch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mturk_batch` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `language` char(16) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `submissions_per_hit` int(11) NOT NULL DEFAULT 3,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mturk_input`
--

DROP TABLE IF EXISTS `mturk_input`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mturk_input` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `batch` int(11) NOT NULL,
  `id1` int(11) DEFAULT NULL,
  `thingtalk1` mediumtext COLLATE utf8_bin DEFAULT NULL,
  `sentence1` text CHARACTER SET utf8 DEFAULT NULL,
  `id2` int(11) DEFAULT NULL,
  `thingtalk2` mediumtext COLLATE utf8_bin DEFAULT NULL,
  `sentence2` text CHARACTER SET utf8 DEFAULT NULL,
  `id3` int(11) DEFAULT NULL,
  `thingtalk3` mediumtext COLLATE utf8_bin DEFAULT NULL,
  `sentence3` text CHARACTER SET utf8 DEFAULT NULL,
  `id4` int(11) DEFAULT NULL,
  `thingtalk4` mediumtext COLLATE utf8_bin DEFAULT NULL,
  `sentence4` text CHARACTER SET utf8 DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `batch` (`batch`),
  CONSTRAINT `mturk_input_ibfk_1` FOREIGN KEY (`batch`) REFERENCES `mturk_batch` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mturk_log`
--

DROP TABLE IF EXISTS `mturk_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mturk_log` (
  `submission_id` char(16) COLLATE utf8_bin NOT NULL,
  `batch` int(11) NOT NULL,
  `hit` int(11) DEFAULT NULL,
  `worker` varchar(32) COLLATE utf8_bin DEFAULT NULL,
  PRIMARY KEY (`submission_id`),
  UNIQUE KEY `hit` (`hit`,`worker`),
  KEY `batch` (`batch`),
  CONSTRAINT `mturk_log_ibfk_1` FOREIGN KEY (`batch`) REFERENCES `mturk_batch` (`id`),
  CONSTRAINT `mturk_log_ibfk_2` FOREIGN KEY (`hit`) REFERENCES `mturk_input` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mturk_output`
--

DROP TABLE IF EXISTS `mturk_output`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mturk_output` (
  `submission_id` char(16) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `example_id` int(11) NOT NULL,
  `program_id` int(11) NOT NULL,
  `target_count` int(11) NOT NULL DEFAULT 3,
  `accept_count` int(11) NOT NULL DEFAULT 0,
  `reject_count` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`submission_id`,`example_id`),
  KEY `example_id` (`example_id`),
  CONSTRAINT `mturk_output_ibfk_1` FOREIGN KEY (`example_id`) REFERENCES `example_utterances` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `oauth2_permissions`
--

DROP TABLE IF EXISTS `oauth2_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `oauth2_permissions` (
  `user_id` char(64) COLLATE utf8_bin NOT NULL,
  `client_id` char(64) COLLATE utf8_bin NOT NULL,
  `scope` text COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`user_id`,`client_id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `oauth2_permissions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`cloud_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `oauth2_permissions_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `oauth2_clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `oauth2_clients`
--

DROP TABLE IF EXISTS `oauth2_clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `oauth2_clients` (
  `id` char(64) COLLATE utf8_bin NOT NULL,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `owner` int(11) NOT NULL,
  `secret` char(64) COLLATE utf8_bin NOT NULL,
  `magic_power` tinyint(1) NOT NULL DEFAULT 0,
  `allowed_scopes` text COLLATE utf8_bin NOT NULL,
  `allowed_redirect_uris` text COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`id`),
  KEY `owner` (`owner`),
  CONSTRAINT `oauth2_clients_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `organizations`
--

DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organizations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_hash` char(16) COLLATE utf8_bin NOT NULL,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `comment` text COLLATE utf8_bin NOT NULL,
  `developer_key` char(64) COLLATE utf8_bin NOT NULL,
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_hash` (`id_hash`),
  UNIQUE KEY `developer_key` (`developer_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) unsigned NOT NULL,
  `data` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `snapshot`
--

DROP TABLE IF EXISTS `snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `snapshot` (
  `snapshot_id` int(11) NOT NULL AUTO_INCREMENT,
  `description` varchar(255) CHARACTER SET utf8 NOT NULL,
  `date` datetime NOT NULL,
  PRIMARY KEY (`snapshot_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `subscribe`
--

DROP TABLE IF EXISTS `subscribe`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscribe` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `subscribe_time` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `models`
--

DROP TABLE IF EXISTS `models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `models` (
  `tag` varchar(64) COLLATE utf8_bin,
  `for_devices` mediumtext COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) COLLATE utf8_bin NOT NULL,
  `human_name` tinytext CHARACTER SET utf8 DEFAULT NULL,
  `email` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `locale` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en-US',
  `timezone` varchar(64) COLLATE utf8_bin NOT NULL DEFAULT 'America/Los_Angeles',
  `model_tag` varchar(64) COLLATE utf8_bin DEFAULT NULL,
  `google_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `facebook_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `omlet_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `password` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `salt` char(64) COLLATE utf8_bin DEFAULT NULL,
  `cloud_id` char(64) COLLATE utf8_bin NOT NULL,
  `auth_token` char(64) COLLATE utf8_bin NOT NULL,
  `storage_key` char(64) COLLATE utf8_bin NOT NULL,
  `roles` int(11) NOT NULL DEFAULT 0,
  `profile_flags` int(11) NOT NULL DEFAULT 0,
  `assistant_feed_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `developer_status` tinyint(4) NOT NULL DEFAULT 0,
  `developer_org` int(11) DEFAULT NULL,
  `force_separate_process` tinyint(1) NOT NULL DEFAULT 0,
  `registration_time` datetime NOT NULL DEFAULT current_timestamp(),
  `lastlog_time` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `cloud_id` (`cloud_id`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `facebook_id` (`facebook_id`),
  UNIQUE KEY `omlet_id` (`omlet_id`),
  KEY `developer_org` (`developer_org`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`developer_org`) REFERENCES `organizations` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

--
-- Table structure for table `blog_posts`
--

DROP TABLE IF EXISTS `blog_posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `blog_posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `author` int(11) NOT NULL,
  `slug` varchar(255) COLLATE utf8_bin NOT NULL,
  `title` varchar(255) CHARACTER SET utf8 NOT NULL,
  `image` varchar(255) CHARACTER SET utf8 NOT NULL,
  `blurb` text CHARACTER SET utf8mb4 NOT NULL,
  `source` mediumtext CHARACTER SET utf8mb4 NOT NULL,
  `body` mediumtext CHARACTER SET utf8mb4 NOT NULL,
  `pub_date` datetime NULL,
  `upd_date` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `author` (`author`),
  KEY `upd_date` (`upd_date`),
  CONSTRAINT `blog_posts_ibfk_1` FOREIGN KEY (`author`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;