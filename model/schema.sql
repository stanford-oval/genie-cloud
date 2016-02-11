drop table if exists device_class_kind cascade;
drop table if exists app_device cascade;
drop table if exists app_tag cascade;
drop table if exists device_class cascade;
drop table if exists app cascade;
drop table if exists oauth2_access_tokens cascade;
drop table if exists oauth2_auth_codes cascade;
drop table if exists users cascade;
drop table if exists oauth2_clients cascade;

create table users (
    id integer auto_increment primary key,
    username varchar(255) unique not null,
    human_name tinytext default null collate utf8_general_ci,
    email varchar(255) not null,
    google_id varchar(255) unique default null,
    facebook_id varchar(255) unique default null,
    password char(64) default null,
    salt char(64) default null,
    cloud_id char(64) unique not null,
    auth_token char(64) not null,
    assistant_feed_id varchar(255) default null,
    developer_key char(64) unique default null,
    developer_status tinyint not null default 0,
    roles tinyint not null default 0,
    constraint password_salt check ((password is not null and salt is not null) or
                                    (password is null and salt is null)),
    constraint auth_method check (password is not null or google_id is not null or facebook_id is not null),
    constraint developer_key check (developer_key is null or developer_status > 0)
) collate = utf8_bin ;

insert into users (
    0, 'root', 'Administrator', 'root@localhost', null, null,
    'a266940f93a5928c96b50c173c26cad2054c8077e1caa63584dfcfaa4881d2f1',
    '00832c5af6048c2fc9713722ef0c896202e2f1b30a746394900fb0e8132d958d',
    '5f9ea96b5ce8c0b1ab675fd1cd614af7e707332ec461cb96fea7a4414202ee02',
    '6311efb5e042580a3ccd95c6104af72865195fb94045104d6784533b39f77fd6',
    null, null, 3 );

create table oauth2_clients (
    id char(64) primary key,
    secret char(64) not null,
    magic_power boolean not null default false
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

create table app (
    id integer auto_increment primary key,
    owner integer,
    name varchar(255) not null collate utf8_general_ci,
    description text not null collate utf8_general_ci,
    code mediumtext not null,
    foreign key (owner) references users(id) on update cascade on delete set null
) collate = utf8_bin;

create table device_class (
    id integer auto_increment primary key,
    primary_kind varchar(128) unique not null,
    global_name varchar(128) default null,
    owner integer not null,
    name varchar(255) not null collate utf8_general_ci,
    description text not null collate utf8_general_ci,
    fullcode boolean not null default false,
    approved_version integer(11) default null,
    developer_version integer(11) not null default 0,
    foreign key (owner) references users(id) on update cascade on delete cascade,
    constraint version check (approved_version is null or developer_version >= approved_version)
) collate utf8_bin;

create table device_schema (
    id integer auto_increment primary key,
    kind varchar(128) unique not null,
    developer_version integer(11) not null default 0,
    approved_version integer(11) default null
) collate utf8_bin;

create table device_schema_version (
    schema_id integer not null,
    version integer not null,
    types mediumtext not null,
    primary key(schema_id, version),
    foreign key (schema_id) references device_schema(id) on update cascade on delete cascade
) collate utf8_bin;

create table device_code_version (
    device_id integer not null,
    version integer not null,
    code mediumtext not null,
    primary key(device_id, version),
    foreign key (device_id) references device_class(id) on update cascade on delete cascade
) collate utf8_bin;

create table app_device (
    app_id integer not null,
    device_id integer not null,
    primary key (app_id, device_id),
    foreign key (app_id) references app(id) on update cascade on delete cascade,
    foreign key (device_id) references device_class(id) on update cascade on delete cascade
) collate utf8_bin;

create table app_tag (
    id integer auto_increment primary key,
    app_id integer not null,
    tag varchar(255) not null collate utf8_general_ci,
    key(tag),
    foreign key (app_id) references app(id) on update cascade on delete cascade
) collate utf8_bin;

create table device_class_tag (
    tag varchar(128) not null,
    device_id integer not null,
    primary key(tag, device_id),
    foreign key (device_id) references device_class(id) on update cascade on delete restrict
) collate utf8_bin;

create table device_class_kind (
    device_id integer not null,
    kind varchar(128) not null,
    primary key(device_id, kind),
    foreign key (device_id) references device_class(id) on update cascade on delete cascade
) collate utf8_bin;

create table category (
    id integer auto_increment primary key,
    catchphrase varchar(255) not null collate utf8_general_ci,
    name varchar(255) not null collate utf8_general_ci,
    description mediumtext not null collate utf8_general_ci,
    tag varchar(255) not null collate utf8_general_ci,
    icon varchar(255) not null,
    order_position integer not null default 0,
    key(order_position)
) collate utf8_bin;

