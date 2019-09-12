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

CREATE TABLE `mturk_input2` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `batch` int(11) NOT NULL,
  `hit_id` int(11) NOT NULL,
  `thingtalk` text COLLATE utf8_bin NOT NULL,
  `sentence` text CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`id`),
  KEY `batch_hit` (`batch`, `hit_id`),
  CONSTRAINT `mturk_input_ibfk_1` FOREIGN KEY (`batch`) REFERENCES `mturk_batch` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

INSERT into `mturk_input2`(`batch`,`hit_id`,`thingtalk`,`sentence`)
  ((SELECT `batch`,`id`,`thingtalk1`,`sentence1` FROM `mturk_input`)
   UNION
   (SELECT `batch`,`id`,`thingtalk2`,`sentence2` FROM `mturk_input`)
   UNION
   (SELECT `batch`,`id`,`thingtalk3`,`sentence3` FROM `mturk_input`)
   UNION
   (SELECT `batch`,`id`,`thingtalk4`,`sentence4` FROM `mturk_input`)
   ORDER BY `batch`, `id`);

RENAME TABLE `mturk_input2` TO `mturk_input`;

ALTER TABLE `mturk_batch`
    ADD `status` enum('created','paraphrasing','validating','complete') NOT NULL COLLATE utf8_bin DEFAULT 'created';

ALTER TABLE `mturk_log`
  DROP FOREIGN KEY `mturk_log_ibfk_2`,
  DROP UNIQUE KEY `hit`;

ALTER TABLE `mturk_output`
  DROP FOREIGN KEY `mturk_output_ibfk_1`,
  DROP PRIMARY KEY,
  DROP KEY `example_id`,
  ADD PRIMARY KEY (`example_id`),
  ADD KEY `submission_id`,
  ADD CONSTRAINT `mturk_output_ibfk_0` FOREIGN KEY (`submission_id`) REFERENCES `mturk_log` (`submission_id`) ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT `mturk_output_ibfk_1` FOREIGN KEY (`example_id`) REFERENCES `example_utterances` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `mturk_output_ibfk_2` FOREIGN KEY (`program_id`) REFERENCES `mturk_input` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT;

DROP TABLE IF EXISTS `mturk_validation_input`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mturk_validation_input` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `batch` int(11) NOT NULL,
  `hit_id` int(11) NOT NULL,
  `type` enum('real','fake-same','fake-different') COLLATE utf8_bin NOT NULL,
  `program_id` int(11) NOT NULL,
  `example_id` int(11) NULL,
  `paraphrase` text CHARACTER SET utf8 DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `batch_hit` (`batch`, `hit_id`),
  KEY `program_id` (`program_id`),
  KEY `example_id` (`example_id`),
  CONSTRAINT `mturk_validation_input_ibfk_1` FOREIGN KEY (`batch`) REFERENCES `mturk_batch` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `mturk_validation_input_ibfk_2` FOREIGN KEY (`example_id`) REFERENCES `example_utterances` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `mturk_validation_input_ibfk_3` FOREIGN KEY (`program_id`) REFERENCES `mturk_input` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `mturk_validation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mturk_validation_log` (
  `submission_id` char(16) COLLATE utf8_bin NOT NULL,
  `batch` int(11) NOT NULL,
  `hit` int(11) DEFAULT NULL,
  `worker` varchar(32) COLLATE utf8_bin DEFAULT NULL,
  PRIMARY KEY (`submission_id`),
  KEY `batch_hit` (`batch`, `hit`),
  CONSTRAINT `mturk_validation_log_ibfk_1` FOREIGN KEY (`batch`) REFERENCES `mturk_batch` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `mturk_validation_output`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mturk_validation_output` (
  `validation_sentence_id` int(11) NOT NULL,
  `submission_id` char(16) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `answer` enum('same','different') COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`validation_sentence_id`, `submission_id`),
  KEY `submission_id` (`validation_sentence_id`, `submission_id`),
  CONSTRAINT `mturk_validation_output_ibfk_0` FOREIGN KEY (`submission_id`) REFERENCES `mturk_validation_log` (`submission_id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `mturk_validation_output_ibfk_1` FOREIGN KEY (`validation_sentence_id`) REFERENCES `mturk_validation_input` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
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
