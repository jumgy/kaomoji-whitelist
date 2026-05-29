-- Fix "permission denied for table whitelist_entries" on Apply
-- Run in Supabase SQL Editor

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON TABLE public.whitelist_entries TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.whitelist_entries TO authenticated;

-- Columns for manual scoring (safe if already applied)
ALTER TABLE whitelist_entries
  ADD COLUMN IF NOT EXISTS pts_follow INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pts_like INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pts_repost INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pts_comment INTEGER NOT NULL DEFAULT 0;

ALTER TABLE whitelist_entries
  ALTER COLUMN connect_points SET DEFAULT 0;

GRANT EXECUTE ON FUNCTION public.count_approved_referrals(TEXT) TO anon, authenticated;
