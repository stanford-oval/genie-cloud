ALTER TABLE `user_conversation_state`
    DROP COLUMN `history`,
    ADD COLUMN `recording` boolean NOT NULL default false;

DROP TABLE IF EXISTS `user_conversation_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_conversation_history` (
  `userId` int(11) not NULL,
  `uniqueId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `conversationId` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `messageId` int(11) NOT NULL,
  `message` text COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`userId`, `uniqueId`),
  UNIQUE KEY (`userId`, `conversationId`, `messageId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
