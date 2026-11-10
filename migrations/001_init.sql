create table if not exists rooms (
  stage text not null,
  code text not null,
  version integer not null default 1,
  host_user text not null,
  data jsonb not null,
  presence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stage, code)
);

create index if not exists rooms_host_idx on rooms (stage, host_user, created_at);
create index if not exists rooms_updated_idx on rooms (updated_at);

create table if not exists gm_usage (
  stage text not null,
  user_key text not null,
  day date not null,
  count integer not null default 0,
  primary key (stage, user_key, day)
);
