-- User Privilege system: run in Supabase SQL Editor
-- Stores per-login-email permissions (JSON) and links to staff record.

CREATE TABLE IF NOT EXISTS public.user_privileges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  display_name TEXT,
  username TEXT,
  user_type TEXT NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_privileges_email ON public.user_privileges (lower(email));

ALTER TABLE public.user_privileges ENABLE ROW LEVEL SECURITY;

-- Helper: current auth email from JWT
CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(auth.jwt() ->> 'email', ''), '');
$$;

CREATE OR REPLACE FUNCTION public.is_privilege_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_privileges up
    WHERE lower(up.email) = lower(public.auth_email())
      AND up.is_active = true
      AND up.is_super_admin = true
  );
$$;

DROP POLICY IF EXISTS user_privileges_select ON public.user_privileges;
CREATE POLICY user_privileges_select ON public.user_privileges
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower(public.auth_email())
    OR public.is_privilege_super_admin()
  );

DROP POLICY IF EXISTS user_privileges_insert ON public.user_privileges;
CREATE POLICY user_privileges_insert ON public.user_privileges
  FOR INSERT TO authenticated
  WITH CHECK (public.is_privilege_super_admin());

DROP POLICY IF EXISTS user_privileges_update ON public.user_privileges;
CREATE POLICY user_privileges_update ON public.user_privileges
  FOR UPDATE TO authenticated
  USING (public.is_privilege_super_admin())
  WITH CHECK (public.is_privilege_super_admin());

DROP POLICY IF EXISTS user_privileges_delete ON public.user_privileges;
CREATE POLICY user_privileges_delete ON public.user_privileges
  FOR DELETE TO authenticated
  USING (public.is_privilege_super_admin());

-- Bootstrap owner accounts (full access)
INSERT INTO public.user_privileges (email, display_name, is_super_admin, is_active, permissions)
VALUES
  ('shayankidscare@gmail.com', 'Niflan', true, true, '{}'::jsonb),
  ('info@shayankids.lk', 'Niflan', true, true, '{}'::jsonb),
  ('zaidn2848@gmail.com', 'Zaid', true, true, '{}'::jsonb)
ON CONFLICT (email) DO UPDATE SET
  is_super_admin = EXCLUDED.is_super_admin,
  is_active = true,
  display_name = COALESCE(public.user_privileges.display_name, EXCLUDED.display_name);
