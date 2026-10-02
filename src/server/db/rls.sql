-- Row-Level Security policies for tenant isolation.
-- Applied after schema migrations. Idempotent: safe to run repeatedly.
--
-- Every tenant-scoped table gets a policy that only exposes rows whose
-- tenant_id equals the current session's app.current_tenant setting.
-- The app connects as a NON-superuser role so these policies are enforced.
-- current_setting(..., true) returns NULL when unset (no rows leak).

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'users', 'sessions', 'invitations', 'companies', 'contacts',
    'pipelines', 'stages', 'deals', 'activities', 'subscriptions',
    'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Enable + force RLS (FORCE so it applies even to the table owner).
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    -- Drop existing policy so this script stays idempotent.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);

    -- USING controls visibility of existing rows (SELECT/UPDATE/DELETE).
    -- WITH CHECK controls what can be inserted/updated.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_setting(''app.current_tenant'', true)::uuid)
         WITH CHECK (tenant_id = current_setting(''app.current_tenant'', true)::uuid);',
      t
    );
  END LOOP;
END $$;
