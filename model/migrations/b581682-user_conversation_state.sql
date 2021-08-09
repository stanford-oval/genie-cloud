--
-- Table structure for table `user_conversation_state`
--
DROP TABLE IF EXISTS `user_conversation_state`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_conversation_state` (
  `userId` int(11) not NULL,
  `uniqueId` varchar(255) COLLATE utf8mb4_bin not NULL,
  `history` text COLLATE utf8mb4_bin NULL,
  `dialogueState` text COLLATE utf8mb4_bin NULL,
  `lastMessageId` int(11) NULL,
  PRIMARY KEY (`userId`, `uniqueId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;