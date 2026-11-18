-- =====================================================================
-- RCPL Vendor POD Management System — Row Level Security
--
-- The Express API runs every user-scoped query inside a transaction with
--   SET LOCAL ROLE authenticated
--   set_config('request.jwt.claims', '{"sub": "<auth user id>"}', true)
-- so these policies are enforced by PostgreSQL itself, not just by the API.
-- (They also apply to anyone calling Supabase PostgREST directly with a
-- user JWT.) The anon role gets no access at all.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read user_profiles /
-- vendors without recursing into RLS).
-- ---------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.user_profiles where auth_user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where auth_user_id = auth.uid() and role = 'ADMIN'
  )
$$;

-- Vendor id of the caller, ONLY when the vendor account is ACTIVE.
-- This is what enforces "no access before admin approval" at DB level.
create or replace function public.current_vendor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.vendor_id
  from public.user_profiles p
  join public.vendors v on v.id = p.vendor_id
  where p.auth_user_id = auth.uid()
    and p.role = 'VENDOR'
    and v.account_status = 'ACTIVE'
$$;

-- Vendor id of the caller regardless of status (used only for reading the
-- caller's own registration request).
create or replace function public.current_vendor_id_any_status()
returns uuid language sql stable security definer set search_path = public as $$
  select vendor_id from public.user_profiles
  where auth_user_id = auth.uid() and role = 'VENDOR'
$$;

-- ---------------------------------------------------------------------
-- POD status transition guard (applies to every writer)
-- ---------------------------------------------------------------------
create or replace function public.guard_pod_submission_update()
returns trigger language plpgsql as $$
declare
  caller_is_admin boolean := public.is_admin();
  is_user_context boolean := current_user = 'authenticated';
begin
  if new.current_status is distinct from old.current_status then
    if not (
         (old.current_status = 'PENDING'      and new.current_status = 'UNDER_REVIEW')
      or (old.current_status = 'UNDER_REVIEW' and new.current_status in ('APPROVED', 'REJECTED'))
      or (old.current_status = 'REJECTED'     and new.current_status = 'UNDER_REVIEW')
    ) then
      raise exception 'Invalid POD status transition % -> %', old.current_status, new.current_status
        using errcode = '22023';
    end if;
  end if;

  if new.current_status = 'REJECTED' and coalesce(length(trim(new.admin_remarks)), 0) = 0 then
    raise exception 'Rejection remarks are mandatory' using errcode = '23514';
  end if;

  if new.vendor_id <> old.vendor_id or new.submission_number <> old.submission_number then
    raise exception 'vendor_id and submission_number are immutable' using errcode = '42501';
  end if;

  -- Additional restrictions for vendor (non-admin) callers
  if is_user_context and not caller_is_admin then
    if not (old.current_status = 'REJECTED' and new.current_status = 'UNDER_REVIEW') then
      raise exception 'Vendors may only resubmit rejected PODs' using errcode = '42501';
    end if;
    if new.current_version <> old.current_version + 1 then
      raise exception 'Resubmission must create a new document version' using errcode = '42501';
    end if;
    if new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.admin_remarks is distinct from old.admin_remarks then
      raise exception 'Vendors cannot modify review fields' using errcode = '42501';
    end if;
  end if;

  -- Admins review; they do not edit vendor-supplied data
  if is_user_context and caller_is_admin then
    if new.po_number <> old.po_number or new.invoice_number <> old.invoice_number
       or new.delivery_date <> old.delivery_date
       or new.current_version <> old.current_version then
      raise exception 'Admins cannot modify vendor submission data' using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists pod_submissions_guard on public.pod_submissions;
create trigger pod_submissions_guard before update on public.pod_submissions
  for each row execute function public.guard_pod_submission_update();

-- ---------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------
alter table public.vendors                      enable row level security;
alter table public.user_profiles                enable row level security;
alter table public.vendor_registration_requests enable row level security;
alter table public.pod_submissions              enable row level security;
alter table public.pod_documents                enable row level security;
alter table public.pod_status_history           enable row level security;
alter table public.notifications                enable row level security;

-- ---------------------------------------------------------------------
-- Grants: nothing for anon; least privilege for authenticated
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update on public.vendors to authenticated;
grant select on public.user_profiles to authenticated;
grant select, update on public.vendor_registration_requests to authenticated;
grant select, insert, update on public.pod_submissions to authenticated;
grant select, insert on public.pod_documents to authenticated;
grant select, insert on public.pod_status_history to authenticated;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant usage on sequence public.pod_submission_number_seq to authenticated;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_vendor_id() to authenticated;
grant execute on function public.current_vendor_id_any_status() to authenticated;

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------
-- vendors
drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors for select to authenticated
  using (public.is_admin() or id = public.current_vendor_id());

drop policy if exists vendors_admin_insert on public.vendors;
create policy vendors_admin_insert on public.vendors for insert to authenticated
  with check (public.is_admin());

drop policy if exists vendors_admin_update on public.vendors;
create policy vendors_admin_update on public.vendors for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- user_profiles
drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());

-- vendor_registration_requests
drop policy if exists vrr_select on public.vendor_registration_requests;
create policy vrr_select on public.vendor_registration_requests for select to authenticated
  using (public.is_admin() or vendor_id = public.current_vendor_id_any_status());

drop policy if exists vrr_admin_update on public.vendor_registration_requests;
create policy vrr_admin_update on public.vendor_registration_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- pod_submissions
drop policy if exists pod_select on public.pod_submissions;
create policy pod_select on public.pod_submissions for select to authenticated
  using (public.is_admin() or vendor_id = public.current_vendor_id());

drop policy if exists pod_vendor_insert on public.pod_submissions;
create policy pod_vendor_insert on public.pod_submissions for insert to authenticated
  with check (
    vendor_id = public.current_vendor_id()
    and current_status = 'UNDER_REVIEW'
    and reviewed_by is null
    and admin_remarks is null
  );

drop policy if exists pod_update on public.pod_submissions;
create policy pod_update on public.pod_submissions for update to authenticated
  using (public.is_admin() or vendor_id = public.current_vendor_id())
  with check (public.is_admin() or vendor_id = public.current_vendor_id());

-- pod_documents
drop policy if exists pod_documents_select on public.pod_documents;
create policy pod_documents_select on public.pod_documents for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.pod_submissions s
      where s.id = submission_id and s.vendor_id = public.current_vendor_id()
    )
  );

drop policy if exists pod_documents_vendor_insert on public.pod_documents;
create policy pod_documents_vendor_insert on public.pod_documents for insert to authenticated
  with check (
    uploaded_by = public.current_profile_id()
    and exists (
      select 1 from public.pod_submissions s
      where s.id = submission_id and s.vendor_id = public.current_vendor_id()
    )
  );

-- pod_status_history
drop policy if exists pod_history_select on public.pod_status_history;
create policy pod_history_select on public.pod_status_history for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.pod_submissions s
      where s.id = submission_id and s.vendor_id = public.current_vendor_id()
    )
  );

drop policy if exists pod_history_insert on public.pod_status_history;
create policy pod_history_insert on public.pod_status_history for insert to authenticated
  with check (
    updated_by = public.current_profile_id()
    and (
      public.is_admin() or exists (
        select 1 from public.pod_submissions s
        where s.id = submission_id and s.vendor_id = public.current_vendor_id()
      )
    )
  );

-- notifications (rows are created by the API's system context)
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());
