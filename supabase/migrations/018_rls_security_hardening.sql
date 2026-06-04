create or replace function public.prevent_non_admin_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_platform_admin() then
    raise exception 'Only platform admins can change user roles.';
  end if;

  return new;
end;
$$;

drop trigger if exists users_prevent_non_admin_role_change on public.users;
create trigger users_prevent_non_admin_role_change
before update on public.users
for each row execute function public.prevent_non_admin_user_role_change();
