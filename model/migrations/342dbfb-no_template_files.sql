ALTER TABLE `models`
    DROP CONSTRAINT `models_ibfk_2`;
ALTER TABLE `models`
    DROP COLUMN `template_file`;

DROP VIEW IF EXISTS `org_statistics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE SQL SECURITY INVOKER VIEW `org_statistics`
  AS SELECT
   org.id,
   (select count(*) from device_class where owner = org.id) as device_count,
   (select count(*) from device_class where license_gplcompatible and owner = org.id) as oss_device_count,
   (select count(*) from device_class where approved_version is not null and owner = org.id) as approved_device_count,
   (select count(*) from device_class where license_gplcompatible and approved_version is not null and owner = org.id) as oss_approved_device_count
   from organizations org;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE `template_files`;
