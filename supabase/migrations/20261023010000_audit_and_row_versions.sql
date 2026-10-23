-- Audit log + row versioning for reference/admin tables.

-- ---------------------------------------------------------------- row versions
-- updated_at already exists on airports/airlines/aircraft_types; add it to the join tables, and add row_version everywhere.
alter table public.airline_fleet add column updated_at timestamptz not null default now();
alter table public.airline_hubs  add column updated_at timestamptz not null default now();
alter table public.airports       add column row_version integer not null default 1;
alter table public.airlines       add column row_version integer not null default 1;
alter table public.aircraft_types add column row_version integer not null default 1;
alter table public.airline_fleet  add column row_version integer not null default 1;
alter table public.airline_hubs   add column row_version integer not null default 1;

create or replace function public.bump_row_version() returns trigger
  language plpgsql set search_path = public as
$$
begin
  new.updated_at  := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create trigger bump_row_version before update on public.airports       for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.airlines       for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.aircraft_types for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.airline_fleet  for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.airline_hubs   for each row execute function public.bump_row_version();

-- ---------------------------------------------------------------- change log
create type public.change_action as enum ('insert', 'update', 'delete');
create table public.change_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text not null,        -- PK value; composite PKs stored as JSON, e.g. {"airline_id":1,"airport_id":2}
  action      public.change_action not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid default auth.uid(),   -- null for service-role / migrations
  changed_at  timestamptz not null default now()
);
create index change_log_record_idx on public.change_log (table_name, record_id, changed_at desc);
create index change_log_time_idx on public.change_log (changed_at desc);

alter table public.change_log enable row level security;
-- Editors and admins can read. No insert/update/delete policies => no direct writes for anon/authenticated;
-- rows are written only by the SECURITY DEFINER trigger below.
create policy "editor read" on public.change_log for select using (public.has_role('editor'));
revoke insert, update, delete, truncate on public.change_log from anon, authenticated;

-- Generic audit trigger. Trigger args = primary key column names (default: id).
create or replace function public.audit_row_change() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare
  rec     jsonb;
  pk_cols text[] := array['id'];
  rid     text;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_nargs > 0 then
    pk_cols := array[]::text[];
    for i in 0 .. tg_nargs - 1 loop pk_cols := pk_cols || tg_argv[i]; end loop;
  end if;
  if array_length(pk_cols, 1) = 1 then
    rid := rec ->> pk_cols[1];
  else
    select jsonb_object_agg(c, rec -> c)::text into rid from unnest(pk_cols) as c;
  end if;

  insert into public.change_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name, rid, lower(tg_op)::public.change_action,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return null;  -- AFTER trigger
end;
$$;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

create trigger audit after insert or update or delete on public.airports       for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.airlines       for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.aircraft_types for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.airline_fleet  for each row execute function public.audit_row_change('airline_id', 'aircraft_type_id');
create trigger audit after insert or update or delete on public.airline_hubs   for each row execute function public.audit_row_change('airline_id', 'airport_id');
create trigger audit after insert or update or delete on public.data_versions  for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.user_roles     for each row execute function public.audit_row_change('user_id', 'role');
