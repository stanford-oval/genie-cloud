ALTER TABLE `mturk_batch`
    ADD `owner` int(11) NOT NULL AFTER `id`,
    ADD `id_hash` char(32) COLLATE utf8_bin NOT NULL AFTER `id`,
    ADD CONSTRAINT `mturk_batch_ibfk_1` FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- not very crypto secure but good enough for the few batches we already have
UPDATE `mturk_batch` SET `owner` = 1, `id_hash` = MD5(RAND());
