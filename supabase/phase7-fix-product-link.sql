-- Add product_id column to courses
alter table public.courses add column if not exists product_id uuid references public.products(id) on delete set null;
