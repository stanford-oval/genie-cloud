ALTER TABLE utterance_log
  ADD COLUMN IF NOT EXISTS time datetime DEFAULT current_timestamp();
