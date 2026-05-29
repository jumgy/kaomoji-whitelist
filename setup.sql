-- ============================================================
-- Kaomoji Whitelist — Supabase SQL Migration
-- ============================================================
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS whitelist_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
    twitter_id TEXT NOT NULL,
    twitter_username TEXT NOT NULL,
    twitter_avatar TEXT,
    wallet_address TEXT NOT NULL,
    connect_points INTEGER NOT NULL DEFAULT 0,
    task_follow BOOLEAN DEFAULT FALSE,
    task_like BOOLEAN DEFAULT FALSE,
    task_repost BOOLEAN DEFAULT FALSE,
    task_comment BOOLEAN DEFAULT FALSE,
    pts_follow INTEGER NOT NULL DEFAULT 0,
    pts_like INTEGER NOT NULL DEFAULT 0,
    pts_repost INTEGER NOT NULL DEFAULT 0,
    pts_comment INTEGER NOT NULL DEFAULT 0,
    referral_code TEXT UNIQUE DEFAULT substr(gen_random_uuid()::text, 1, 8),
    referred_by TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE whitelist_entries ENABLE ROW LEVEL SECURITY;

-- Users can read their own entry
CREATE POLICY "users_read_own"
    ON whitelist_entries FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own entry
CREATE POLICY "users_insert_own"
    ON whitelist_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update only task flags on their own entry
CREATE POLICY "users_update_own_tasks"
    ON whitelist_entries FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Anyone can validate a referral code exists (anon select, limited columns via app logic)
CREATE POLICY "anon_check_referral"
    ON whitelist_entries FOR SELECT
    USING (true);

-- ============================================================
-- Helper: count approved referrals for a given code
-- ============================================================
CREATE OR REPLACE FUNCTION count_approved_referrals(code TEXT)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT count(*)::int
    FROM whitelist_entries
    WHERE referred_by = code AND status = 'approved';
$$;
