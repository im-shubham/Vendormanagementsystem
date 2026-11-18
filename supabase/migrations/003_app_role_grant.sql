-- Allow the API's database user to switch into the `authenticated` role for
-- user-scoped (RLS-enforced) transactions. On Supabase the `postgres` user
-- normally already has this membership; failures are reported but ignored.
do $$ begin
  execute format('grant authenticated to %I', current_user);
exception when others then
  raise notice 'Could not grant authenticated to %: % (this is fine if the membership already exists)', current_user, sqlerrm;
end $$;
