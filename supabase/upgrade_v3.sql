-- ALUSAF V3. Run only in your NEW alusaf-crm Supabase project's SQL Editor.
-- Independent from old Supabase Auth, profiles, projects and MIJOZLAR.
-- DOES NOT DELETE old tables or users.
create extension if not exists pgcrypto;

create table if not exists public.crm_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text not null,
  phone text,
  password_hash text not null,
  role text not null default 'pending'
    check (role in ('pending', 'worker', 'boss', 'admin')),
  active boolean not null default true,
  session_version integer not null default 1,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  constraint username_lower_check check (username = lower(username))
);

create table if not exists public.crm_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer_name text,
  customer_phone text,
  address text,
  area_m2 numeric(14,2) not null default 0 check (area_m2 >= 0),
  sell_price_m2 numeric(16,2) not null default 0 check (sell_price_m2 >= 0),
  status text not null default 'yangi'
    check (status in ('yangi','jarayonda','tayyor','topshirildi')),
  created_at timestamptz not null default now()
);

create table if not exists public.crm_assignments (
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  user_id uuid not null references public.crm_users(id) on delete cascade,
  primary key (project_id, user_id)
);

create table if not exists public.crm_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  category text not null,
  item_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(16,2) not null check (unit_price >= 0),
  sheet_width_m numeric(8,3) check (sheet_width_m > 0),
  sheet_height_m numeric(8,3) check (sheet_height_m > 0),
  material_area_m2 numeric(16,3) generated always as
    (case when sheet_width_m is not null and sheet_height_m is not null
      then quantity * sheet_width_m * sheet_height_m else null end) stored,
  total numeric(20,2) generated always as (quantity * unit_price) stored,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  amount numeric(16,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_work_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  user_id uuid not null references public.crm_users(id) on delete cascade,
  arrived_at timestamptz not null default now(),
  left_at timestamptz,
  completed_m2 numeric(14,2) not null default 0 check (completed_m2 >= 0),
  note text,
  constraint left_after_arrival check (left_at is null or left_at >= arrived_at)
);

create index if not exists crm_work_logs_user_idx on public.crm_work_logs(user_id, arrived_at desc);
create index if not exists crm_expenses_project_idx on public.crm_expenses(project_id);
create index if not exists crm_payments_project_idx on public.crm_payments(project_id);

-- All browser access is denied; only server-side service role can access these tables.
alter table public.crm_users enable row level security;
alter table public.crm_projects enable row level security;
alter table public.crm_assignments enable row level security;
alter table public.crm_expenses enable row level security;
alter table public.crm_payments enable row level security;
alter table public.crm_work_logs enable row level security;

revoke all on public.crm_users, public.crm_projects, public.crm_assignments,
  public.crm_expenses, public.crm_payments, public.crm_work_logs
from anon, authenticated;

create unique index if not exists crm_one_open_shift_per_user
  on public.crm_work_logs(user_id) where left_at is null;
