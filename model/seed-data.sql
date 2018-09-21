-- MySQL dump 10.16  Distrib 10.2.14-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: thingengine
-- ------------------------------------------------------
-- Server version	10.2.14-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `organizations` WRITE;
/*!40000 ALTER TABLE `organizations` DISABLE KEYS */;
INSERT INTO `organizations`
(`id`,`name`,`comment`,`developer_key`,`is_admin`) VALUES
(0,'Site Administration','','0243de281cf4892575bef0477c177387fac1883ce4e7dd558eaf0e10777bd194', 1);
/*!40000 ALTER TABLE `organizations` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users`
(`id`,`username`,`human_name`,`email`,`locale`,`timezone`,`google_id`,`facebook_id`,`omlet_id`,
`password`,`salt`,`cloud_id`,`auth_token`,`storage_key`,`roles`,`assistant_feed_id`,
`developer_status`,`developer_org`,`force_separate_process`,`registration_time`,`lastlog_time`)
VALUES
(0,'root','Administrator','root@localhost','en-US','America/Los_Angeles',NULL,NULL,NULL,
'a266940f93a5928c96b50c173c26cad2054c8077e1caa63584dfcfaa4881d2f1',
'00832c5af6048c2fc9713722ef0c896202e2f1b30a746394900fb0e8132d958d',
'5f9ea96b5ce8c0b1',
'6311efb5e042580a3ccd95c6104af72865195fb94045104d6784533b39f77fd6',
'6fdf9e57fa9ab621e6a93d5a99cb1c7d4b12f58a5f3481dd2082cc23ff700b71',
1,NULL,3,0,0,current_timestamp,current_timestamp),

(1,'anonymous','Anonymous User','anonymous@localhost','en-US','America/Los_Angeles',NULL,NULL,NULL,
'a266940f93a5928c96b50c173c26cad2054c8077e1caa63584dfcfaa4881d2f1',
'00832c5af6048c2fc9713722ef0c896202e2f1b30a746394900fb0e8132d958d',
'aed747094bdc037e',
'435b4590edd13ffba01784e3abde5d9e33c86b6e8161414721455c2845ca9721',
'fa83f17a0ecca92bc6e87b55e21d37c05ac9a2e69d234bbbfe8c39c8eca7c68b',
0,NULL,0,0,0,current_timestamp,current_timestamp);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;