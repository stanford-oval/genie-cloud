-- MySQL dump 10.16  Distrib 10.2.14-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: thingengine
-- ------------------------------------------------------
-- Server version	10.2.14-MariaDB

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
-- Table structure for table `app`
--

DROP TABLE IF EXISTS `app`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `app` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner` int(11) DEFAULT NULL,
  `app_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `description` text CHARACTER SET utf8 NOT NULL,
  `code` mediumtext COLLATE utf8_bin NOT NULL,
  `visible` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `app_id` (`app_id`),
  KEY `owner` (`owner`),
  CONSTRAINT `app_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `app`
--

LOCK TABLES `app` WRITE;
/*!40000 ALTER TABLE `app` DISABLE KEYS */;
/*!40000 ALTER TABLE `app` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `app_tag`
--

DROP TABLE IF EXISTS `app_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `app_tag` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `app_id` int(11) NOT NULL,
  `tag` varchar(255) CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`id`),
  KEY `tag` (`tag`),
  KEY `app_id` (`app_id`),
  CONSTRAINT `app_tag_ibfk_1` FOREIGN KEY (`app_id`) REFERENCES `app` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `app_tag`
--

LOCK TABLES `app_tag` WRITE;
/*!40000 ALTER TABLE `app_tag` DISABLE KEYS */;
/*!40000 ALTER TABLE `app_tag` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `background`
--

LOCK TABLES `background` WRITE;
/*!40000 ALTER TABLE `background` DISABLE KEYS */;
/*!40000 ALTER TABLE `background` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `background_rectangle`
--

LOCK TABLES `background_rectangle` WRITE;
/*!40000 ALTER TABLE `background_rectangle` DISABLE KEYS */;
/*!40000 ALTER TABLE `background_rectangle` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `background_tag`
--

LOCK TABLES `background_tag` WRITE;
/*!40000 ALTER TABLE `background_tag` DISABLE KEYS */;
/*!40000 ALTER TABLE `background_tag` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `category`
--

LOCK TABLES `category` WRITE;
/*!40000 ALTER TABLE `category` DISABLE KEYS */;
/*!40000 ALTER TABLE `category` ENABLE KEYS */;
UNLOCK TABLES;

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
  `fullcode` tinyint(1) NOT NULL DEFAULT 0,
  `module_type` varchar(64) COLLATE utf8_bin NOT NULL,
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
-- Dumping data for table `device_class`
--

LOCK TABLES `device_class` WRITE;
/*!40000 ALTER TABLE `device_class` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_class` ENABLE KEYS */;
UNLOCK TABLES;

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
  CONSTRAINT `device_class_kind_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_class_kind`
--

LOCK TABLES `device_class_kind` WRITE;
/*!40000 ALTER TABLE `device_class_kind` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_class_kind` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_class_tag`
--

DROP TABLE IF EXISTS `device_class_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_class_tag` (
  `tag` varchar(128) COLLATE utf8_bin NOT NULL,
  `device_id` int(11) NOT NULL,
  PRIMARY KEY (`tag`,`device_id`),
  KEY `device_id` (`device_id`),
  CONSTRAINT `device_class_tag_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_class_tag`
--

LOCK TABLES `device_class_tag` WRITE;
/*!40000 ALTER TABLE `device_class_tag` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_class_tag` ENABLE KEYS */;
UNLOCK TABLES;

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
  `mtime` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`device_id`,`version`),
  CONSTRAINT `device_code_version_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_code_version`
--

LOCK TABLES `device_code_version` WRITE;
/*!40000 ALTER TABLE `device_code_version` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_code_version` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `device_schema`
--

LOCK TABLES `device_schema` WRITE;
/*!40000 ALTER TABLE `device_schema` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_schema` ENABLE KEYS */;
UNLOCK TABLES;

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
  `keywords` mediumtext CHARACTER SET utf8 NOT NULL,
  `argcanonicals` mediumtext CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`schema_id`,`version`,`language`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_schema_channel_canonicals`
--

LOCK TABLES `device_schema_channel_canonicals` WRITE;
/*!40000 ALTER TABLE `device_schema_channel_canonicals` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_schema_channel_canonicals` ENABLE KEYS */;
UNLOCK TABLES;

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
  `doc` mediumtext COLLATE utf8_bin NOT NULL,
  `is_list` tinyint(1) NOT NULL DEFAULT 1,
  `is_monitorable` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`schema_id`,`version`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_schema_channels`
--

LOCK TABLES `device_schema_channels` WRITE;
/*!40000 ALTER TABLE `device_schema_channels` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_schema_channels` ENABLE KEYS */;
UNLOCK TABLES;

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
  `kind_type` enum('primary','global','app','other') COLLATE utf8_bin NOT NULL DEFAULT 'other',
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
-- Dumping data for table `device_schema_snapshot`
--

LOCK TABLES `device_schema_snapshot` WRITE;
/*!40000 ALTER TABLE `device_schema_snapshot` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_schema_snapshot` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `entity_lexicon`
--

LOCK TABLES `entity_lexicon` WRITE;
/*!40000 ALTER TABLE `entity_lexicon` DISABLE KEYS */;
/*!40000 ALTER TABLE `entity_lexicon` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `entity_names`
--

LOCK TABLES `entity_names` WRITE;
/*!40000 ALTER TABLE `entity_names` DISABLE KEYS */;
/*!40000 ALTER TABLE `entity_names` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `entity_names_snapshot`
--

LOCK TABLES `entity_names_snapshot` WRITE;
/*!40000 ALTER TABLE `entity_names_snapshot` DISABLE KEYS */;
/*!40000 ALTER TABLE `entity_names_snapshot` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `example_utterances`
--

DROP TABLE IF EXISTS `example_utterances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `example_utterances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `schema_id` int(11) DEFAULT NULL,
  `app_id` int(11) DEFAULT NULL,
  `is_base` tinyint(1) NOT NULL DEFAULT 0,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `type` char(32) COLLATE utf8_bin NOT NULL DEFAULT 'other',
  `utterance` text CHARACTER SET utf8 NOT NULL,
  `preprocessed` text CHARACTER SET utf8 NOT NULL,
  `target_json` text COLLATE utf8_bin NOT NULL,
  `target_code` text COLLATE utf8_bin NOT NULL,
  `click_count` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `schema_id` (`schema_id`),
  KEY `app_id` (`app_id`),
  KEY `language_type` (`language`,`type`),
  FULLTEXT KEY `preprocessed` (`preprocessed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `example_utterances`
--

LOCK TABLES `example_utterances` WRITE;
/*!40000 ALTER TABLE `example_utterances` DISABLE KEYS */;
/*!40000 ALTER TABLE `example_utterances` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `mturk_batch`
--

LOCK TABLES `mturk_batch` WRITE;
/*!40000 ALTER TABLE `mturk_batch` DISABLE KEYS */;
/*!40000 ALTER TABLE `mturk_batch` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `mturk_input`
--

LOCK TABLES `mturk_input` WRITE;
/*!40000 ALTER TABLE `mturk_input` DISABLE KEYS */;
/*!40000 ALTER TABLE `mturk_input` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `mturk_log`
--

LOCK TABLES `mturk_log` WRITE;
/*!40000 ALTER TABLE `mturk_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `mturk_log` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mturk_output`
--

LOCK TABLES `mturk_output` WRITE;
/*!40000 ALTER TABLE `mturk_output` DISABLE KEYS */;
/*!40000 ALTER TABLE `mturk_output` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `oauth2_access_tokens`
--

DROP TABLE IF EXISTS `oauth2_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `oauth2_access_tokens` (
  `user_id` int(11) NOT NULL DEFAULT 0,
  `client_id` char(64) COLLATE utf8_bin NOT NULL DEFAULT '',
  `token` char(64) COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`user_id`,`client_id`),
  UNIQUE KEY `token` (`token`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `oauth2_access_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `oauth2_access_tokens_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `oauth2_clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `oauth2_access_tokens`
--

LOCK TABLES `oauth2_access_tokens` WRITE;
/*!40000 ALTER TABLE `oauth2_access_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `oauth2_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `oauth2_auth_codes`
--

DROP TABLE IF EXISTS `oauth2_auth_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `oauth2_auth_codes` (
  `user_id` int(11) NOT NULL DEFAULT 0,
  `client_id` char(64) COLLATE utf8_bin NOT NULL DEFAULT '',
  `code` char(64) COLLATE utf8_bin DEFAULT NULL,
  `redirectURI` tinytext COLLATE utf8_bin DEFAULT NULL,
  PRIMARY KEY (`user_id`,`client_id`),
  KEY `code` (`code`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `oauth2_auth_codes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `oauth2_auth_codes_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `oauth2_clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `oauth2_auth_codes`
--

LOCK TABLES `oauth2_auth_codes` WRITE;
/*!40000 ALTER TABLE `oauth2_auth_codes` DISABLE KEYS */;
/*!40000 ALTER TABLE `oauth2_auth_codes` ENABLE KEYS */;
UNLOCK TABLES;

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
  PRIMARY KEY (`id`),
  KEY `owner` (`owner`),
  CONSTRAINT `oauth2_clients_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `oauth2_clients`
--

LOCK TABLES `oauth2_clients` WRITE;
/*!40000 ALTER TABLE `oauth2_clients` DISABLE KEYS */;
/*!40000 ALTER TABLE `oauth2_clients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `organizations`
--

DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organizations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `comment` text COLLATE utf8_bin NOT NULL,
  `developer_key` char(64) COLLATE utf8_bin NOT NULL,
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `developer_key` (`developer_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `organizations`
--

LOCK TABLES `organizations` WRITE;
/*!40000 ALTER TABLE `organizations` DISABLE KEYS */;
INSERT INTO `organizations` VALUES (0,'Site Administration','','0243de281cf4892575bef0477c177387fac1883ce4e7dd558eaf0e10777bd194',0);
/*!40000 ALTER TABLE `organizations` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `snapshot`
--

LOCK TABLES `snapshot` WRITE;
/*!40000 ALTER TABLE `snapshot` DISABLE KEYS */;
/*!40000 ALTER TABLE `snapshot` ENABLE KEYS */;
UNLOCK TABLES;

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
  `locale` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en-US',
  `timezone` varchar(64) COLLATE utf8_bin NOT NULL DEFAULT 'America/Los_Angeles',
  `google_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `facebook_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `omlet_id` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `password` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `salt` char(64) COLLATE utf8_bin DEFAULT NULL,
  `cloud_id` char(64) COLLATE utf8_bin NOT NULL,
  `auth_token` char(64) COLLATE utf8_bin NOT NULL,
  `storage_key` char(64) COLLATE utf8_bin NOT NULL,
  `roles` int(11) NOT NULL DEFAULT 0,
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

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (0,'root','Administrator','root@localhost','en-US','America/Los_Angeles',NULL,NULL,NULL,'a266940f93a5928c96b50c173c26cad2054c8077e1caa63584dfcfaa4881d2f1','00832c5af6048c2fc9713722ef0c896202e2f1b30a746394900fb0e8132d958d','5f9ea96b5ce8c0b1','6311efb5e042580a3ccd95c6104af72865195fb94045104d6784533b39f77fd6','6fdf9e57fa9ab621e6a93d5a99cb1c7d4b12f58a5f3481dd2082cc23ff700b71',1,NULL,3,0,0,'2018-05-23 22:22:26','2018-05-23 22:22:26');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2018-05-23 22:22:56
