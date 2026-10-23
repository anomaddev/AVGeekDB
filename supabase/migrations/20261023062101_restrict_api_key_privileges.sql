-- API key hashes and minting stay on the service role. Signed-in users can read
-- their key metadata and update name / revoked_at. There is no insert policy.

revoke all on table public.api_keys from anon, authenticated;
grant select (id, user_id, name, prefix, created_at, last_used_at, revoked_at)
  on table public.api_keys to authenticated;
grant update (name, revoked_at) on table public.api_keys to authenticated;

revoke insert, update, delete, truncate on table public.api_usage from anon, authenticated;
revoke select on table public.api_usage from anon;

revoke all on table public.api_usage_daily from anon;
revoke insert, update, delete, truncate on table public.api_usage_daily from authenticated;

create or replace function public.api_keys_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- End-user JWTs cannot restore a revoked key. service_role has a null uid.
  if auth.uid() is not null
     and old.revoked_at is not null
     and new.revoked_at is distinct from old.revoked_at then
    raise exception 'revoked API keys cannot be restored';
  end if;
  return new;
end;
$$;

revoke all on function public.api_keys_guard_update() from public, anon, authenticated;

-- has_role is security definer and only checks the current user. Signed-in
-- users call it for the admin gate and for RLS. Anonymous clients do not.
revoke execute on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;

drop trigger if exists api_keys_guard_update on public.api_keys;
create trigger api_keys_guard_update
  before update on public.api_keys
  for each row execute function public.api_keys_guard_update();
