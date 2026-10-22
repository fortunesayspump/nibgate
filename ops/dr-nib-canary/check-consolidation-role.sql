-- Read-only role-attribute gate, not a complete database isolation audit.
-- Supply -v application_role=<existing application login>; never put a DSN
-- or password in the command line. Run with psql -X and a private PGPASSFILE.
\set ON_ERROR_STOP on
\if :{?application_role}
\else
  \echo 'Missing application_role; no changes made.'
  DO $$ BEGIN RAISE EXCEPTION 'Missing application_role'; END $$;
\endif

BEGIN READ ONLY;
SET LOCAL statement_timeout = '3s';
SELECT EXISTS (
  SELECT 1 FROM pg_roles app
  WHERE app.rolname = :'application_role'
    AND app.rolcanlogin
    AND NOT (app.rolsuper OR app.rolcreatedb OR app.rolcreaterole
             OR app.rolreplication OR app.rolbypassrls)
    -- NOINHERIT alone does not prevent SET ROLE through membership.
    AND NOT EXISTS (
      SELECT 1 FROM pg_roles elevated
      WHERE (elevated.rolsuper OR elevated.rolcreatedb OR elevated.rolcreaterole
             OR elevated.rolreplication OR elevated.rolbypassrls
             OR elevated.rolname LIKE 'pg\_%' ESCAPE '\')
        AND pg_has_role(app.oid, elevated.oid, 'MEMBER')
    )
) AS application_role_is_restricted \gset
ROLLBACK;

\if :application_role_is_restricted
  \echo 'PASS: application role attributes and privileged memberships are restricted.'
\else
  \echo 'BLOCKED: application role is missing, cannot log in, or has elevated privileges/membership.'
  DO $$ BEGIN RAISE EXCEPTION 'Consolidation role prerequisite failed'; END $$;
\endif
