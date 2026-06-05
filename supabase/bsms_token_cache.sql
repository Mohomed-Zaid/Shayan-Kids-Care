-- supabase/bsms_token_cache.sql
-- Table to cache BSMS API access token and refresh token

-- Step 1: Create the table (for new setups)
create table if not exists bsms_token_cache (
    id int primary key default 1,
    access_token text not null,
    refresh_token text,
    expires_at timestamptz not null,
    updated_at timestamptz default now()
);

-- Step 2: Ensure only one row ever exists (insert if not exists)
insert into bsms_token_cache (id, access_token, expires_at)
values (1, '', now())
on conflict (id) do nothing;

-- Step 3: For existing tables, add refresh_token column (safe to run if already exists)
alter table bsms_token_cache add column if not exists refresh_token text;
