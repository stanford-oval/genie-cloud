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