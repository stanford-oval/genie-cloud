ALTER TABLE blog_posts ADD
  `in_homepage` boolean NOT NULL DEFAULT true;

DROP TABLE IF EXISTS `homepage_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `homepage_links` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) CHARACTER SET utf8 NOT NULL,
  `image` varchar(255) CHARACTER SET utf8 NOT NULL,
  `blurb` text CHARACTER SET utf8mb4 NOT NULL,
  `link` text CHARACTER SET utf8 NOT NULL,
  `upd_date` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `upd_date` (`upd_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
