-- =============================================
-- Phase 5: Orders + Products + Payments
-- =============================================

-- PRODUCTS (продукты)
create table public.products (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_products_project on public.products(project_id);

-- TARIFFS (тарифы продукта)
create table public.tariffs (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  name text not null,
  price integer not null default 0, -- в копейках (или рублях, решим)
  features text[] default '{}',
  course_id uuid, -- привязка к курсу (Phase 7)
  is_active boolean default true,
  order_position integer default 0,
  created_at timestamptz default now()
);

create index idx_tariffs_product on public.tariffs(product_id);

-- ORDERS (заказы)
create type public.order_status as enum ('new', 'in_progress', 'paid', 'partial', 'refund', 'cancelled');

create table public.orders (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  customer_id uuid references public.customers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  tariff_id uuid references public.tariffs(id) on delete set null,
  status public.order_status default 'new',
  amount integer not null default 0,
  paid_amount integer default 0,
  customer_email text,
  customer_name text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_orders_project on public.orders(project_id);
create index idx_orders_customer on public.orders(customer_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_created on public.orders(created_at);

-- PAYMENTS (платежи в рамках заказа)
create table public.payments (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  amount integer not null,
  method text default 'prodamus',
  external_id text, -- ID от Продамус
  status text default 'success',
  created_at timestamptz default now()
);

create index idx_payments_order on public.payments(order_id);

-- ORDER NOTES (заметки менеджеров к заказу)
create table public.order_notes (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete set null,
  text text not null,
  created_at timestamptz default now()
);

create index idx_order_notes_order on public.order_notes(order_id);

-- =============================================
-- RLS POLICIES
-- =============================================

alter table public.products enable row level security;
create policy "Project members can manage products"
  on public.products for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

alter table public.tariffs enable row level security;
create policy "Project members can manage tariffs"
  on public.tariffs for all
  using (exists (
    select 1 from public.products p
    where p.id = tariffs.product_id
    and public.is_project_member(p.project_id)
  ));

alter table public.orders enable row level security;
create policy "Project members can manage orders"
  on public.orders for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

alter table public.payments enable row level security;
create policy "Project members can manage payments"
  on public.payments for all
  using (exists (
    select 1 from public.orders o
    where o.id = payments.order_id
    and public.is_project_member(o.project_id)
  ));

alter table public.order_notes enable row level security;
create policy "Project members can manage order notes"
  on public.order_notes for all
  using (exists (
    select 1 from public.orders o
    where o.id = order_notes.order_id
    and public.is_project_member(o.project_id)
  ));
