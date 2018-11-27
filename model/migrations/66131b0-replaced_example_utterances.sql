DROP TABLE IF EXISTS `replaced_example_utterances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `replaced_example_utterances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `type` char(32) COLLATE utf8_bin NOT NULL DEFAULT 'other',
  `flags` set('synthetic','augmented','obsolete','ambiguous','template','training','exact') COLLATE utf8_bin NOT NULL DEFAULT '',
  `preprocessed` text CHARACTER SET utf8 NOT NULL,
  `target_code` text COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`id`),
  KEY `language_type` (`language`,`type`),
  KEY `language_flags` (`language`,`flags`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE ;
START TRANSACTION ;
INSERT INTO `replaced_example_utterances`(`language`,`type`,`flags`,`preprocessed`,`target_code`)
SELECT `language`,`type`,replace(replace(`flags`, 'replaced', ''), ',,', ','),`preprocessed`,`target_code` from `example_utterances` where find_in_set('replaced', `flags`);

DELETE FROM `example_utterances` where find_in_set('replaced', `flags`);

COMMIT;

ALTER TABLE `example_utterances` MODIFY `flags` set('synthetic','augmented','obsolete','ambiguous','template','training','exact') COLLATE utf8_bin NOT NULL DEFAULT '';
