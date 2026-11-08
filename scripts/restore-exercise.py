"""Read-only staging dump -> isolated runner Postgres. Never uploads the dump."""
import os, json, subprocess, hashlib, time, re
from pathlib import Path
from urllib.parse import urlsplit, unquote
started=time.monotonic()
ref="qbogvclmehvrtuwiktos"
uri=urlsplit(os.environ.get("DIRECT_URL", ""))
if os.environ.get("APP_ENVIRONMENT")!="staging" or os.environ.get("STAGING_SUPABASE_PROJECT_REF")!=ref:
    raise SystemExit("Restore exercise is staging-only")
if not (uri.hostname==f"db.{ref}.supabase.co" or (uri.hostname.endswith(".pooler.supabase.com") and unquote(uri.username or "")==f"postgres.{ref}")):
    raise SystemExit("Refusing unknown/production source")
container=os.environ.get("RESTORE_CONTAINER", "")
if not re.fullmatch(r"[a-f0-9]{12,64}", container): raise SystemExit("Isolated restore container required")
private=Path(".tmp-tests/restore");private.mkdir(parents=True,exist_ok=True)
source=os.environ.copy();source.update(PGHOST=uri.hostname,PGPORT=str(uri.port or 5432),PGUSER=unquote(uri.username),PGPASSWORD=unquote(uri.password),PGDATABASE="postgres",PGSSLMODE="require")
local=os.environ.copy();local.update(PGHOST="127.0.0.1",PGPORT="5432",PGUSER="postgres",PGPASSWORD="isolated-restore-only",PGDATABASE="restore_acceptance",PGSSLMODE="disable")
def command(args, env, data=None, stage="database command", output=None):
    result=subprocess.run(["docker","exec","-i",*[arg for key in ["PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE","PGSSLMODE"] for arg in ["-e",key]],container,*args],input=data,env=env,capture_output=output is None,stdout=output,stderr=subprocess.PIPE if output else None,timeout=240)
    if result.returncode:
        (private/"private-error.txt").write_bytes(result.stderr or b"")
        raise RuntimeError(f"Isolated restore exercise failed during {stage}; credentials and SQL data were not logged")
    return result.stdout or b""
def sql(query, env, stage="SQL verification"):
    return command(["psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1"],env,query.encode(),stage).decode().strip()
# Export one repeatable-read source snapshot and retain it until both dump and counts finish.
exporter=subprocess.Popen(["docker","exec","-i",*[arg for key in ["PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE","PGSSLMODE"] for arg in ["-e",key]],container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1"],env=source,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
exporter.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();\n");exporter.stdin.flush()
snapshot=exporter.stdout.readline().strip()
if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+",snapshot): exporter.kill();raise SystemExit("Could not export staging snapshot")
def source_sql(query): return sql(f"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '{snapshot}'; {query}; COMMIT;",source)
def ident(name): return '"'+name.replace('"','""')+'"'
try:
    tables=json.loads(source_sql("SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private','auth') AND c.relkind IN ('r','p')"))
    count_query="SELECT json_object_agg(key,n) FROM ("+" UNION ALL ".join("SELECT '"+(r['schema']+'.'+r['table']).replace("'","''")+"' key,count(*) n FROM "+ident(r['schema'])+'.'+ident(r['table']) for r in tables)+") counts"
    counts=json.loads(source_sql(count_query))
    roles=json.loads(source_sql("SELECT json_agg(rolname) FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname<>'postgres'"))
    catalog_query="""SELECT json_build_object(
      'tables',(SELECT json_agg(json_build_array(n.nspname,c.relname,c.relrowsecurity) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private') AND c.relkind IN ('r','p')),
      'columns',(SELECT json_agg(json_build_array(table_schema,table_name,column_name,data_type,is_nullable,column_default) ORDER BY table_schema,table_name,ordinal_position) FROM information_schema.columns WHERE table_schema IN ('public','app_private')),
      'constraints',(SELECT json_agg(json_build_array(n.nspname,c.relname,con.conname,pg_get_constraintdef(con.oid)) ORDER BY n.nspname,c.relname,con.conname) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private')),
      'policies',(SELECT json_agg(json_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) ORDER BY schemaname,tablename,policyname) FROM pg_policies WHERE schemaname IN ('public','app_private'))
    )"""
    catalog=json.loads(source_sql(catalog_query))
    dump=private/"staging-private.dump"
    with dump.open('wb') as out:
        command(["pg_dump","--format=custom","--no-owner","--schema=public","--schema=app_private","--schema=auth",f"--snapshot={snapshot}"],source,stage="read-only staging backup",output=out)
finally:
    exporter.stdin.write("ROLLBACK;\n");exporter.stdin.close();exporter.wait(timeout=20)
# The destination is a disposable local container database, never a hosted target.
bootstrap=local.copy();bootstrap["PGDATABASE"]="postgres"
sql("CREATE DATABASE restore_acceptance;",bootstrap,"isolated database creation")
sql(";".join("CREATE ROLE "+ident(role)+" NOLOGIN NOSUPERUSER NOBYPASSRLS" for role in roles)+";",local,"isolated role recreation")
sql('CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;',local,"required local extensions")
with dump.open('rb') as data:
    command(["pg_restore","--clean","--if-exists","--exit-on-error","--no-owner","--dbname=restore_acceptance"],local,data.read(),"isolated schema/data restore")
restored_counts=json.loads(sql(count_query,local));restored_catalog=json.loads(sql(catalog_query,local))
if counts!=restored_counts: raise RuntimeError("Restored key record counts do not match the backup snapshot")
if catalog!=restored_catalog: raise RuntimeError("Restored application schema, constraints or RLS policies differ from the backup snapshot")
# Foreign-key restoration validates relationships. Also check key canonical links explicitly.
relationships=json.loads(sql("""SELECT json_build_object(
 'initiative_project_orphans',(SELECT count(*) FROM public."Initiative" i LEFT JOIN public."Project" p ON p.id=i."projectId" WHERE p.id IS NULL),
 'feature_intake_orphans',(SELECT count(*) FROM public."Capability" c LEFT JOIN public."IntakeAnswerSet" a ON a.id=c."intakeAnswerSetId" WHERE a.id IS NULL),
 'artifact_parent_orphans',(SELECT count(*) FROM public."ArtifactLayer" a LEFT JOIN public."ArtifactLayer" p ON p.id=a."parentId" WHERE a."parentId" IS NOT NULL AND p.id IS NULL),
 'duplicate_feature_identities',(SELECT count(*) FROM (SELECT "prototypeId","sourceCapabilityId" FROM public."ArtifactLayer" WHERE type='feature' AND "archivedAt" IS NULL AND "sourceCapabilityId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) x)
)""",local))
if any(relationships.values()): raise RuntimeError("Restored canonical relationships failed verification")
readiness=sql("""BEGIN; SET LOCAL ROLE app_rw; SELECT set_config('request.jwt.claims','{"sub":null,"role":"authenticated"}',true); SELECT (current_user='app_rw' AND NOT rolsuper AND NOT rolbypassrls AND to_regclass('public."RegenerationProposal"') IS NOT NULL AND to_regclass('app_private."WorkerExecution"') IS NOT NULL)::text FROM pg_roles WHERE rolname=current_user; ROLLBACK;""",local)
if not readiness.endswith('true'): raise RuntimeError("Restored application database readiness failed")
report={"status":"passed","sourceProject":ref,"backupSha256":hashlib.sha256(dump.read_bytes()).hexdigest(),"backupBytes":dump.stat().st_size,"snapshotIdentity":snapshot,"durationSeconds":round(time.monotonic()-started,2),"schemaAndRlsMatch":True,"recordCounts":counts,"relationships":relationships,"applicationDatabaseReadiness":True,"scope":"Application/private/Auth database schemas restored into disposable PostgreSQL. Hosted Supabase services, external OAuth grant state and storage binaries are not exercised."}
Path('.tmp-tests/restore-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ['status','backupSha256','durationSeconds','schemaAndRlsMatch','relationships','applicationDatabaseReadiness','scope']}))
dump.unlink()
