-- Run this in Supabase → SQL editor (same project as your kv_store table).

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

-- Same open trust model as kv_store (anon key can read/write everything).
-- Tighten these if you add real auth later.
create policy "public read" on push_subscriptions for select using (true);
create policy "public write" on push_subscriptions for insert with check (true);
create policy "public update" on push_subscriptions for update using (true);
create policy "public delete" on push_subscriptions for delete using (true);
