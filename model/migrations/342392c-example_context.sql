ALTER TABLE `example_utterances`
  ADD `context` text COLLATE utf8mb4_bin NULL AFTER `target_code`;
