DROP TABLE IF EXISTS `org_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `org_invitations` (
  `user_id` int(11) NOT NULL,
  `org_id` int(11) NOT NULL,
  `developer_status` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `org_id`),
  KEY `org_id` (`org_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
