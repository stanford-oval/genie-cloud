ALTER TABLE `users`
  ADD `phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER email_verified;
