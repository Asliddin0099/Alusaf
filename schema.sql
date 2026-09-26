-- ALUSAF v4: yangi al_ jadvallari; avvalgi jadvallarni o'chirmaydi.
-- YANGI loyihangizning Supabase -> SQL Editor -> Run.
create extension if not exists pgcrypto;

create table if not exists public.al_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text not null,
  phone text,
  password_hash text not null,
  role text not null default 'pending' check (role in ('pending','worker','boss','admin')),
  active boolean not null default true,
  auth_version integer not null default 1,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.al_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  client_phone text,
  address text,
  area_m2 numeric(12,3) not null default 0 check (area_m2 >= 0),
  sell_price_m2 numeric(16,2) not null default 0 check (sell_price_m2 >= 0),
  contract_amount numeric(18,2) not null default 0 check (contract_amount >= 0),
  status text not null default 'Yangi',
  created_at timestamptz not null default now()
);

create table if not exists public.al_assignments (
  user_id uuid not null references public.al_users(id) on delete cascade,
  project_id uuid not null references public.al_projects(id) on delete cascade,
  primary key (user_id, project_id)
);

create table if not exists public.al_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.al_projects(id) on delete cascade,
  category text not null,
  item_name text not null,
  qty numeric(14,3) not null check (qty > 0),
  unit text not null,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  total numeric(20,2) generated always as (qty * unit_price) stored,
  width_m numeric(8,3),
  height_m numeric(8,3),
  note text,
  created_by uuid references public.al_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.al_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.al_projects(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  note text,
  created_by uuid references public.al_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.al_work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.al_users(id) on delete cascade,
  project_id uuid not null references public.al_projects(id) on delete cascade,
  work_date date not null,
  arrived_at timestamptz,
  left_at timestamptz,
  completed_m2 numeric(12,3) not null default 0 check (completed_m2 >= 0),
  note text,
  unique(user_id, project_id, work_date)
);

create index if not exists al_expenses_project_idx on public.al_expenses(project_id);
create index if not exists al_payments_project_idx on public.al_payments(project_id);
create index if not exists al_worklogs_project_idx on public.al_work_logs(project_id);

-- Hammasiga server API orqali kiriladi, brauzer bevosita kira olmaydi.
alter table public.al_users enable row level security;
alter table public.al_projects enable row level security;
alter table public.al_assignments enable row level security;
alter table public.al_expenses enable row level security;
alter table public.al_payments enable row level security;
alter table public.al_work_logs enable row level security;

revoke all on table public.al_users, public.al_projects, public.al_assignments,
  public.al_expenses, public.al_payments, public.al_work_logs from anon, authenticated;
grant all on table public.al_users, public.al_projects, public.al_assignments,
  public.al_expenses, public.al_payments, public.al_work_logs to service_role;

-- Birinchi admin USER SQL ORQALI yaratilmaydi.
-- Vercel'dagi ADMIN_INITIAL_PASSWORD bilan server birinchi ishga tushganda
-- 'Asliddin' nomli adminni xavfsiz hash bilan yaratadi.
