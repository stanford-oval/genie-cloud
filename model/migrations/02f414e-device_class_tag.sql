DROP TABLE IF EXISTS `device_class_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `device_class_tag` (
  `device_id` int(11) NOT NULL AUTO_INCREMENT,
  `tag` varchar(255) COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`device_id`,`tag`),
  KEY `tag` (`tag`),
  CONSTRAINT `device_class_tag_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `device_class` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;