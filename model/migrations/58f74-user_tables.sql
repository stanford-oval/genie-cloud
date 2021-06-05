--
-- Table structure for table `user_app`
--

DROP TABLE IF EXISTS `user_app`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_app` (
  `uniqueId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `userId` int(11) not NULL,
  `code` text COLLATE utf8mb4_bin NOT NULL,
  `state` text COLLATE utf8mb4_bin NOT NULL,
  `name` text COLLATE utf8mb4_bin default NULL,
  `description` text COLLATE utf8mb4_bin default NULL,
  PRIMARY KEY (`userId`, `uniqueId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_device`
--

DROP TABLE IF EXISTS `user_device`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_device` (
  `uniqueId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `userId` int(11) not NULL,
  `state` text COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`userId`, `uniqueId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_device_journal`
--

DROP TABLE IF EXISTS `user_device_journal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
create table `user_device_journal` (
  `uniqueId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `userId` int(11) not NULL,
  `lastModified` datetime NOT NULL,
  PRIMARY KEY (`userId`, `uniqueId`)
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_channel`
--

DROP TABLE IF EXISTS `user_channel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_channel` (
  `uniqueId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `userId` int(11) not NULL,
  `value` text COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`userId`, `uniqueId`)
)ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
