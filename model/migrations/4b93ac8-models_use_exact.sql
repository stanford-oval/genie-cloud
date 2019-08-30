ALTER TABLE `models`
  ADD `use_exact` boolean NOT NULL DEFAULT false;

UPDATE `models` SET `use_exact` = 1 WHERE tag in (
  'org.thingpedia.models.default', 'org.thingpedia.models.developer',
  'org.thingpedia.models.contextual', 'org.thingpedia.models.developer.contextual');
