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
-- Table structure for table `training_jobs`
--

DROP TABLE IF EXISTS `training_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `training_jobs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `depends_on` int(11) NULL,
  `job_type` varchar(255) COLLATE utf8_bin NOT NULL,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `model_tag` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `all_devices` boolean NOT NULL DEFAULT false,
  `status` ENUM('queued', 'started', 'success', 'error') COLLATE utf8_bin NOT NULL DEFAULT 'queued',
  `task_index` int(11) DEFAULT NULL,
  `task_name` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `error` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `progress` DOUBLE NOT NULL DEFAULT 0.0,
  `eta` datetime DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `config` MEDIUMTEXT COLLATE utf8_bin DEFAULT NULL,
  `metrics` MEDIUMTEXT COLLATE utf8_bin DEFAULT NULL,

  PRIMARY KEY (`id`),
  KEY `status` (`status`),
  KEY `end_time` (`end_time`),
  CONSTRAINT `training_job_ibfk_2` FOREIGN KEY (`depends_on`) REFERENCES `training_jobs` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `training_job_task_history`
--

DROP TABLE IF EXISTS `training_job_task_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `training_job_task_history` (
  `job_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_name` varchar(255) COLLATE utf8_bin DEFAULT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,

  PRIMARY KEY (`job_id`, `task_name`),
  CONSTRAINT `training_job_task_history_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `training_jobs` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `training_job_for_devices`
--

DROP TABLE IF EXISTS `training_job_for_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `training_job_for_devices` (
  `job_id` int(11) NOT NULL,
  `schema_id` int(11) NOT NULL,
  PRIMARY KEY (`job_id`, `schema_id`),
  CONSTRAINT `training_job_for_devices_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `training_jobs` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `training_job_for_devices_ibfk_2` FOREIGN KEY (`schema_id`) REFERENCES `device_schema` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
