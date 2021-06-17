DROP TABLE IF EXISTS `user_conversation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_conversation` (
  `userId` int(11) not NULL,
  `uniqueId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `conversationId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `previousId` varchar(255) COLLATE utf8mb4_bin NULL,
  `dialogueId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `context` text COLLATE utf8mb4_bin NULL,
  `agent` varchar(255) COLLATE utf8mb4_bin NULL,
  -- iso 8601 string (for sqlite compatibility)
  `agentTimestamp` char(24) COLLATE utf8mb4_bin NULL,
  `agentTarget` text COLLATE utf8mb4_bin NULL,
  `intermediateContext` text COLLATE utf8mb4_bin NULL,
  `user` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  -- iso 8601 string (for sqlite compatibility)
  `userTimestamp` char(24) COLLATE utf8mb4_bin NOT NULL,
  `userTarget` text COLLATE utf8mb4_bin NOT NULL,
  `vote` ENUM('up', 'down') COLLATE utf8mb4_bin NULL,
  `comment` text COLLATE utf8mb4_bin NULL,
  PRIMARY KEY (`userId`, `uniqueId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
