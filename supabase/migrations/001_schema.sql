-- =====================================================================
-- RCPL Vendor POD Management System — core schema
-- Target: Supabase PostgreSQL (also runs on plain PostgreSQL 14+ when
-- server/src/db/local-auth-shim.sql has been applied first).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
do $$ begin
  create type vendor_account_status as enum (
    'NOT_REGISTERED',   -- vendor master created by admin, password not yet created
    'PENDING_APPROVAL', -- vendor created a password, awaiting admin approval
    'ACTIVE',           -- approved, may use the portal
    'REJECTED',         -- registration rejected by admin
    'DEACTIVATED'       -- deactivated by admin (history is preserved)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('ADMIN', 'VENDOR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type registration_status as enum ('PENDING', 'APPROVED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  -- PENDING is reserved for deliveries that are expected but have no POD yet
  -- (future SAP / delivery-master integration). Vendor uploads start at UNDER_REVIEW.
  create type pod_status as enum ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pod_document_type as enum ('POD', 'SUPPORTING_PHOTO');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- vendors (vendor master)
-- ---------------------------------------------------------------------
create table if not exists public.vendors (
  id              uuid primary key default gen_random_uuid(),
  vendor_code     text not null,
  vendor_name     text not null,
  email           text not null,
  contact_person  text,
  mobile_number   text,
  address         text,
  account_status  vendor_account_status not null default 'NOT_REGISTERED',
  registered_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint vendors_code_format check (vendor_code ~ '^[A-Za-z0-9_-]{2,30}$'),
  constraint vendors_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index if not exists vendors_vendor_code_uq on public.vendors (upper(vendor_code));
create unique index if not exists vendors_email_uq on public.vendors (lower(email));
create index if not exists vendors_status_idx on public.vendors (account_status);
create index if not exists vendors_name_idx on public.vendors (lower(vendor_name));

drop trigger if exists vendors_updated_at on public.vendors;
create trigger vendors_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- user_profiles (links an auth user to a role and, for vendors, a vendor)
-- ---------------------------------------------------------------------
create table if not exists public.user_profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users (id) on delete cascade,
  vendor_id     uuid references public.vendors (id) on delete restrict,
  role          user_role not null,
  full_name     text,
  email         text not null,
  created_at    timestamptz not null default now(),
  constraint user_profiles_vendor_role check (
    (role = 'VENDOR' and vendor_id is not null) or (role = 'ADMIN' and vendor_id is null)
  )
);
create unique index if not exists user_profiles_vendor_uq on public.user_profiles (vendor_id) where vendor_id is not null;

-- ---------------------------------------------------------------------
-- vendor_registration_requests
-- ---------------------------------------------------------------------
create table if not exists public.vendor_registration_requests (
  id               uuid primary key default gen_random_uuid(),
  vendor_id        uuid not null references public.vendors (id) on delete restrict,
  requested_at     timestamptz not null default now(),
  approval_status  registration_status not null default 'PENDING',
  reviewed_by      uuid references public.user_profiles (id),
  reviewed_at      timestamptz,
  remarks          text
);
create index if not exists vrr_vendor_idx on public.vendor_registration_requests (vendor_id);
create index if not exists vrr_status_idx on public.vendor_registration_requests (approval_status, requested_at desc);
-- only one open request per vendor
create unique index if not exists vrr_one_pending_uq on public.vendor_registration_requests (vendor_id)
  where approval_status = 'PENDING';

-- ---------------------------------------------------------------------
-- pod_submissions
-- ---------------------------------------------------------------------
create sequence if not exists public.pod_submission_number_seq start 10001;

create table if not exists public.pod_submissions (
  id                  uuid primary key default gen_random_uuid(),
  submission_number   text not null unique default ('POD-' || nextval('public.pod_submission_number_seq')),
  vendor_id           uuid not null references public.vendors (id) on delete restrict,
  po_number           text not null,
  invoice_number      text not null,
  delivery_date       date not null,
  delivery_reference  text,
  submitted_by        uuid references public.user_profiles (id),
  submitted_at        timestamptz not null default now(),
  current_status      pod_status not null default 'UNDER_REVIEW',
  current_version     integer not null default 1,
  admin_remarks       text,
  reviewed_by         uuid references public.user_profiles (id),
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pod_po_not_blank check (length(trim(po_number)) > 0),
  constraint pod_invoice_not_blank check (length(trim(invoice_number)) > 0),
  constraint pod_version_positive check (current_version >= 1)
);
create index if not exists pod_vendor_idx on public.pod_submissions (vendor_id, submitted_at desc);
create index if not exists pod_status_idx on public.pod_submissions (current_status, submitted_at desc);
create index if not exists pod_po_idx on public.pod_submissions (lower(po_number));
create index if not exists pod_delivery_date_idx on public.pod_submissions (delivery_date);
-- one submission per invoice per vendor (prevents accidental duplicates)
create unique index if not exists pod_vendor_invoice_uq on public.pod_submissions (vendor_id, lower(invoice_number));

drop trigger if exists pod_submissions_updated_at on public.pod_submissions;
create trigger pod_submissions_updated_at before update on public.pod_submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- pod_documents (every upload is kept; versions are never overwritten)
-- ---------------------------------------------------------------------
create table if not exists public.pod_documents (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.pod_submissions (id) on delete restrict,
  document_type   pod_document_type not null default 'POD',
  file_name       text not null,
  storage_path    text not null unique,
  file_type       text not null,
  file_size       bigint not null check (file_size > 0),
  version_number  integer not null check (version_number >= 1),
  uploaded_by     uuid references public.user_profiles (id),
  uploaded_at     timestamptz not null default now()
);
create index if not exists pod_documents_submission_idx on public.pod_documents (submission_id, version_number desc);
create unique index if not exists pod_documents_version_uq on public.pod_documents (submission_id, document_type, version_number);

-- ---------------------------------------------------------------------
-- pod_status_history
-- ---------------------------------------------------------------------
create table if not exists public.pod_status_history (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null references public.pod_submissions (id) on delete restrict,
  previous_status  pod_status,
  new_status       pod_status not null,
  remarks          text,
  version_number   integer,
  updated_by       uuid references public.user_profiles (id),
  updated_at       timestamptz not null default now()
);
create index if not exists pod_status_history_submission_idx on public.pod_status_history (submission_id, updated_at);

-- ---------------------------------------------------------------------
-- notifications (in-app)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles (id) on delete cascade,
  title       text not null,
  message     text not null,
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);
