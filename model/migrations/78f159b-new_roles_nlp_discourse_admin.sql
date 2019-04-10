UPDATE `users` SET `roles` = `roles` | (16+32) WHERE `roles` & 0x1;
