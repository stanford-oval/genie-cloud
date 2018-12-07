DROP TABLE IF EXISTS `oauth2_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `oauth2_permissions` (
  `user_id` char(64) COLLATE utf8_bin NOT NULL,
  `client_id` char(64) COLLATE utf8_bin NOT NULL,
  `scope` text COLLATE utf8_bin NOT NULL,
  PRIMARY KEY (`user_id`,`client_id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `oauth2_permissions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`cloud_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `oauth2_permissions_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `oauth2_clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `oauth2_auth_codes`;
DROP TABLE IF EXISTS `oauth2_access_tokens`;

ALTER TABLE oauth2_clients ADD `allowed_scopes` text COLLATE utf8_bin,
    ADD `allowed_redirect_uris` text COLLATE utf8_bin;
UPDATE oauth2_clients SET `allowed_scopes` = '["profile"]', `allowed_redirect_uris` = '[]';

ALTER TABLE oauth2_clients MODIFY `allowed_scopes` text COLLATE utf8_bin NOT NULL,
    MODIFY `allowed_redirect_uris` text COLLATE utf8_bin NOT NULL;