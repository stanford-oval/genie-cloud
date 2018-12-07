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

ALTER TABLE `example_utterances` ADD `like_count` int(11) NOT NULL DEFAULT 0 AFTER `click_count`;