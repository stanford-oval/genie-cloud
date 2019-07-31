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
-- Table structure for table `alexa_models`
--

DROP TABLE IF EXISTS `alexa_models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `alexa_models` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `tag` varchar(64) COLLATE utf8_bin,
  `owner` int(11) NOT NULL,
  `access_token` char(64) COLLATE utf8_bin NULL,
  `anonymous_user` int(11) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`language`, `tag`),
  KEY `owner` (`owner`),
  CONSTRAINT `alexa_models_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `alexa_models_ibfk_2` FOREIGN KEY (`anonymous_user`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `alexa_model_devices`
--

DROP TABLE IF EXISTS `alexa_model_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `alexa_model_devices` (
  `model_id` int(11) NOT NULL,
  `schema_id` int(11) NOT NULL,
  PRIMARY KEY (`model_id`, `schema_id`),
  KEY `schema_id` (`schema_id`),
  CONSTRAINT `alexa_model_devices_ibfk_1` FOREIGN KEY (`schema_id`) REFERENCES `device_schema` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `alexa_model_devices_ibfk_2` FOREIGN KEY (`model_id`) REFERENCES `alexa_models` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
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
