drop table if exists device_class_kind cascade;
drop table if exists device_class cascade;
drop table if exists oauth2_access_tokens cascade;
drop table if exists oauth2_auth_codes cascade;
drop table if exists users cascade;
drop table if exists oauth2_clients cascade;
drop table if exists organizations cascade;

create table users (
    id integer auto_increment primary key,
    username varchar(255) unique not null,
    human_name tinytext default null collate utf8_general_ci,
    email varchar(255) not null,
    locale char(15) not null default 'en-US',
    timezone varchar(64) not null default 'America/Los_Angeles',
    google_id varchar(255) unique default null,
    facebook_id varchar(255) unique default null,
    omlet_id varchar(255) unique default null,
    password char(64) default null,
    salt char(64) default null,
    cloud_id char(64) unique not null,
    auth_token char(64) not null,
    storage_key char(64) not null,
    developer_org int null default null,
    developer_status tinyint not null default 0,
    roles tinyint not null default 0,
    force_separate_process boolean not null default false,
    constraint password_salt check ((password is not null and salt is not null) or
                                    (password is null and salt is null)),
    constraint auth_method check (password is not null or google_id is not null or facebook_id is not null),
    foreign key (developer_org) references organizations(id) on update cascade on delete restrict
) collate = utf8_bin ;

create table organizations (
    id integer auto_increment primary key,
    name varchar(255) not null collate utf8_general_ci,
    developer_key char(64) unique not null,
    is_admin boolean not null default false
) collate = utf8_bin ;

insert into organizations values (
    0, 'Site Administration', '0243de281cf4892575bef0477c177387fac1883ce4e7dd558eaf0e10777bd194'
);

insert into users values (
    0, 'root', 'Administrator', 'root@localhost', null, null, null,
    'a266940f93a5928c96b50c173c26cad2054c8077e1caa63584dfcfaa4881d2f1', -- password
    '00832c5af6048c2fc9713722ef0c896202e2f1b30a746394900fb0e8132d958d', -- salt
    '5f9ea96b5ce8c0b1ab675fd1cd614af7e707332ec461cb96fea7a4414202ee02', -- cloud_id
    '6311efb5e042580a3ccd95c6104af72865195fb94045104d6784533b39f77fd6', -- auth_token
    0, 3, 1 );

create table oauth2_clients (
    id char(64) primary key,
    owner int not null,
    name varchar(255) not null collate utf8_general_ci,
    secret char(64) not null,
    magic_power boolean not null default false,
    foreign key (owner) references organizations(id) on update cascade on delete cascade,
) collate = utf8_bin ;

create table oauth2_access_tokens (
    user_id integer,
    client_id char(64),
    token char(64) not null,
    primary key (user_id, client_id),
    unique key (token),
    foreign key (user_id) references users(id) on update cascade on delete cascade,
    foreign key (client_id) references oauth2_clients(id) on update cascade on delete cascade
) collate = utf8_bin;

create table oauth2_auth_codes (
    user_id integer,
    client_id char(64),
    code char(64),
    redirectURI tinytext,
    primary key (user_id, client_id),
    key (code),
    foreign key (user_id) references users(id) on update cascade on delete cascade,
    foreign key (client_id) references oauth2_clients(id) on update cascade on delete cascade
) collate = utf8_bin;

create table device_class (
    id integer auto_increment primary key,
    primary_kind varchar(128) unique not null,
    global_name varchar(128) unique default null,
    owner integer not null,
    name varchar(255) not null collate utf8_general_ci,
    description text not null collate utf8_general_ci,
    fullcode boolean not null default false,
    module_type varchar(64) not null,
    category enum('physical','online','data','system') not null default 'physical',
    subcategory enum('service','media','social-network','communication','home','health','data-management') not null default 'service',
    approved_version integer(11) default null,
    developer_version integer(11) not null default 0,
    key (category),
    key (subcategory),
    foreign key (owner) references organizations(id) on update cascade on delete cascade,
    constraint version check (approved_version is null or developer_version >= approved_version)
) collate = utf8_bin;

create table device_schema (
    id integer auto_increment primary key,
    kind varchar(128) unique not null,
    kind_type enum('primary','app','category','discovery','other') not null default 'other',
    kind_canonical varchar(128) not null collate utf8_general_ci,
    owner integer not null,
    developer_version integer(11) not null default 0,
    approved_version integer(11) default null,
    foreign key (owner) references organizations(id) on update cascade on delete cascade
) collate = utf8_bin;

create table device_schema_version (
    schema_id integer not null,
    version integer not null,
    types mediumtext not null,
    meta mediumtext not null,
    primary key(schema_id, version),
    foreign key (schema_id) references device_schema(id) on update cascade on delete cascade
) collate = utf8_bin;

create table device_schema_channels (
    schema_id integer not null,
    version integer not null,
    name varchar(128) not null,
    channel_type enum('trigger', 'action', 'query') not null,
    types mediumtext not null,
    argnames mediumtext not null,
    required mediumtext not null,
    doc mediumtext not null,
    primary key(schema_id, version, name),
    foreign key (schema_id) references device_schema(id) on update cascade on delete cascade
) collate = utf8_bin;

create table device_schema_channel_canonicals (
    schema_id integer not null,
    version integer not null,
    language char(15) not null default 'en',
    name varchar(128) not null,
    canonical text not null collate utf8_general_ci,
    confirmation varchar(255) collate utf8_general_ci default null,
    confirmation_remote varchar(255) collate utf8_general_ci default null,
    formatted mediumtext collate utf8_general_ci default null,
    argcanonicals mediumtext not null collate utf8_general_ci,
    questions mediumtext not null collate utf8_general_ci,
    keywords mediumtext not null collate utf8_general_ci,
    primary key(schema_id, version, language, name),
    key canonical_btree (canonical(30)),
    fulltext key(canonical, keywords)
) collate = utf8_bin;

create table lexicon(
    language char(15) not null default 'en',
    token varchar(128) not null collate utf8_general_ci,
    schema_id integer not null,
    channel_name varchar(128) not null,
    primary key(language, token, schema_id, channel_name),
    foreign key (schema_id) references device_schema(id)
) collate = utf8_bin;

create table example_utterances (
    id integer auto_increment primary key,
    schema_id integer null,
    is_base boolean not null default false,
    language char(15) not null default 'en',
    type char(32) not null default 'other',
    utterance text not null collate utf8_general_ci,
    preprocessed text not null collate utf8_general_ci,
    target_json text not null,
    target_code text not null,
    click_count integer not null default 0,
    key(schema_id),
    fulltext key(preprocessed)
) collate = utf8_bin;

create table example_rule_schema (
    schema_id integer not null,
    example_id integer not null,
    primary key(schema_id, example_id),
    foreign key(schema_id) references device_schema(id) on update cascade on delete cascade,
    foreign key(example_id) references example_utterances(id) on update cascade on delete cascade
) collate = utf8_bin;

create table device_code_version (
    device_id integer not null,
    version integer not null,
    code mediumtext not null,
    primary key(device_id, version),
    foreign key (device_id) references device_class(id) on update cascade on delete cascade
) collate = utf8_bin;

create table device_class_tag (
    tag varchar(128) not null,
    device_id integer not null,
    primary key(tag, device_id),
    foreign key (device_id) references device_class(id) on update cascade on delete restrict
) collate = utf8_bin;

create table device_class_kind (
    device_id integer not null,
    kind varchar(128) not null,
    is_child boolean not null default false,
    primary key(device_id, kind),
    foreign key (device_id) references device_class(id) on update cascade on delete cascade
) collate = utf8_bin;

CREATE TABLE `entity_names` (
  `id` varchar(64) NOT NULL,
  `language` char(15) NOT NULL DEFAULT 'en',
  `name` varchar(255) NOT NULL collate utf8_general_ci,
  `is_well_known` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`,`language`)
) collate = utf8_bin ;

CREATE TABLE `entity_lexicon` (
  `language` char(15) NOT NULL DEFAULT 'en',
  `token` varchar(128) CHARACTER SET utf8 NOT NULL,
  `entity_id` varchar(64) NOT NULL,
  `entity_value` varchar(64) NOT NULL,
  `entity_canonical` varchar(128) CHARACTER SET utf8 NOT NULL,
  `entity_name` varchar(128) CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`language`,`token`,`entity_id`,`entity_value`,`entity_canonical`),
  KEY `entity_id` (`entity_id`),
  FOREIGN KEY (`entity_id`) REFERENCES `entity_names` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) collate = utf8_bin ;

CREATE TABLE `snapshot` (
  `snapshot_id` int(11) NOT NULL AUTO_INCREMENT,
  `description` varchar(255) NOT NULL collate utf8_general_ci,
  `date` datetime NOT NULL,
  PRIMARY KEY (`snapshot_id`)
) collate = utf8_bin ;

CREATE TABLE `device_schema_snapshot` (
  `snapshot_id` int(11) NOT NULL,
  `schema_id` int(11) NOT NULL,
  `kind` varchar(128) COLLATE utf8_bin NOT NULL,
  `kind_type` enum('primary','global','app','other') COLLATE utf8_bin NOT NULL DEFAULT 'other',
  `owner` int(11) DEFAULT '1',
  `developer_version` int(11) NOT NULL,
  `approved_version` int(11) DEFAULT NULL,
  `kind_canonical` varchar(128) COLLATE utf8_bin DEFAULT NULL,
  PRIMARY KEY (`snapshot_id`,`schema_id`),
  UNIQUE KEY `snapshot_id` (`snapshot_id`,`kind`),
  KEY `owner` (`owner`),
  FOREIGN KEY (`owner`) REFERENCES `organizations` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`snapshot_id`) REFERENCES `snapshot` (`snapshot_id`) ON DELETE CASCADE ON UPDATE CASCADE
) COLLATE=utf8_bin ;

CREATE TABLE `entity_names_snapshot` (
  `snapshot_id` int(11) NOT NULL,
  `id` varchar(64) COLLATE utf8_bin NOT NULL,
  `language` char(15) COLLATE utf8_bin NOT NULL DEFAULT 'en',
  `name` varchar(255) CHARACTER SET utf8 NOT NULL,
  `is_well_known` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`snapshot_id`,`id`,`language`),
  FOREIGN KEY (`snapshot_id`) REFERENCES `snapshot` (`snapshot_id`) ON DELETE CASCADE ON UPDATE CASCADE
) COLLATE=utf8_bin ;
