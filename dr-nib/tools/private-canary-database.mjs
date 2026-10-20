const ID=/^[a-z][a-z0-9_]{0,48}$/;
export function canaryDatabaseSql({database='drnib_private_canary',schema='drnib',schemaSql,billingView}){
  if(!ID.test(database)||!ID.test(schema)||!database.endsWith('_canary')||database==='drnib_private_synthetic'||typeof schemaSql!=='string'||!schemaSql.includes('CREATE TABLE "PrivateWorkerLifecycle"')||typeof billingView!=='string'||!billingView.includes('CREATE OR REPLACE VIEW "PrivateToolBillingMetadata"'))throw Error('CANARY_DATABASE_INPUT_INVALID');
  const role=name=>`"${database}_${name}"`,table=name=>`"${schema}"."${name}"`;
  const tables=names=>names.split(',').map(table).join(', ');
  const grants=(who,verbs,names)=>`GRANT ${verbs} ON ${tables(names)} TO ${role(who)};`;
  const roles=['broker','guest','funding','watchdog'];
  const sql=[`-- Fresh isolated database only. Apply as migration administrator with psql ON_ERROR_STOP.\nBEGIN;\nDO $$ BEGIN\n IF current_database() <> '${database}' OR EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name='${schema}') THEN RAISE EXCEPTION 'Fresh canary database required'; END IF;\nEND $$;`,
    `REVOKE ALL ON DATABASE "${database}" FROM PUBLIC;`,
    `CREATE SCHEMA "${schema}";\nREVOKE ALL ON SCHEMA public FROM PUBLIC;\nREVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC;\nSET LOCAL search_path TO "${schema}";`,schemaSql,billingView,
    `ALTER TABLE "PrivateClientObject" ADD CONSTRAINT "PrivateClientObject_revision_check" CHECK ("revision">0), ADD CONSTRAINT "PrivateClientObject_location_check" CHECK (("envelope" IS NULL) <> ("objectKey" IS NULL));`,
    `ALTER TABLE "PrivateAiBudgetReservation" ADD CONSTRAINT "PrivateAiBudgetReservation_amounts_check" CHECK ("reservedMicroUsd">0 AND "committedMicroUsd">=0 AND "committedMicroUsd"<="reservedMicroUsd"), ADD CONSTRAINT "PrivateAiBudgetReservation_status_check" CHECK ("status" IN ('reserved','settled','uncertain')), ADD CONSTRAINT "PrivateAiBudgetReservation_month_check" CHECK ("monthKey" ~ '^[0-9]{4}-[0-9]{2}$');`,
    `ALTER TABLE "PrivateToolCall" ADD CONSTRAINT "PrivateToolCall_amounts" CHECK ("reservedMicroUsd">=0 AND "reservedMicroUsd"<=2000000 AND "committedMicroUsd">=0 AND "committedMicroUsd"<="reservedMicroUsd"), ADD CONSTRAINT "PrivateToolCall_status" CHECK ("status" IN ('approved','reserved','complete','failed'));`,
    ...roles.flatMap(r=>[`CREATE ROLE ${role(r)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;`,`GRANT CONNECT ON DATABASE "${database}" TO ${role(r)};`,`GRANT USAGE ON SCHEMA "${schema}" TO ${role(r)};`,`ALTER ROLE ${role(r)} IN DATABASE "${database}" SET search_path TO "${schema}";`]),
    grants('broker','SELECT, INSERT','ResearchRun'),
    `GRANT UPDATE ("status","metadata","deletedAt","updatedAt") ON ${table('ResearchRun')} TO ${role('broker')};`,
    grants('broker','SELECT, INSERT, UPDATE','PrivateVaultRecord,PrivateClientObject'),
    grants('broker','SELECT','PrivateActionReceipt,PrivateWorkerObject,ResearchStep'),
    grants('broker','SELECT, INSERT, UPDATE','PrivateWorkerLifecycle'),
    grants('guest','SELECT','ResearchRun,BudgetLedger'),
    `GRANT UPDATE ("status","metadata","budgetCap","updatedAt") ON ${table('ResearchRun')} TO ${role('guest')};`,
    grants('guest','SELECT, INSERT, UPDATE','PrivateWorkerObject,PrivateClientObject,PrivateActionReceipt,PrivateInferenceCall,PrivateAiBudgetReservation,ResearchStep'),
    `GRANT SELECT ("id","runId","questionId","tool","requestDigest","status","committedMicroUsd","costBasis","resultDigest","txHash") ON ${table('PrivateToolCall')} TO ${role('guest')};`,
    grants('guest','SELECT','PrivateToolBillingMetadata'),
    `GRANT SELECT ("id","userId","walletAddress","metadata","status","budgetCap","deletedAt","settledAt"), UPDATE ("metadata","settledAt","updatedAt") ON ${table('ResearchRun')} TO ${role('funding')};`,
    grants('funding','SELECT, INSERT','BudgetLedger'),
    `GRANT SELECT ("id","runId","model","status","billingKind","committedMicroUsd","costBasis","usageEvidence") ON ${table('PrivateInferenceCall')} TO ${role('funding')};`,
    `GRANT SELECT ("id","runId","status") ON ${table('PrivateActionReceipt')} TO ${role('funding')};`,
    `GRANT SELECT ("id","runId","committedMicroUsd") ON ${table('PrivateAiBudgetReservation')} TO ${role('funding')};`,
    `GRANT SELECT ("id","runId","kind","revision","removed","digest") ON ${table('PrivateClientObject')} TO ${role('funding')};`,
    grants('funding','SELECT, INSERT, UPDATE','PrivateToolCall'),grants('funding','SELECT','PrivateToolBillingMetadata'),
    grants('watchdog','SELECT, INSERT, UPDATE','PrivateWorkerLifecycle'),
    `GRANT SELECT ("id","userId") ON ${table('ResearchRun')} TO ${role('watchdog')};`,
    `GRANT SELECT ("runId","status","leaseUntil") ON ${table('PrivateActionReceipt')} TO ${role('watchdog')};`,
    'COMMIT;\n-- Roles are NOLOGIN. Provision independent credentials out of band only after review.\n'];
  return sql.join('\n');
}
