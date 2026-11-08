import { randomBytes, randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { rawDb, withAuthenticatedDatabaseContext } from "../src/lib/db";
import { computeFeatureProposalFingerprint } from "../src/lib/ai/assist/fingerprint";
async function main() {
  if (process.argv.includes("--preflight")) { console.log("Acceptance runner transpilation and imports passed; no credentials or database access used."); return; }
const ref = "qbogvclmehvrtuwiktos";
for (const name of ["DATABASE_URL","DIRECT_URL"] as const) {
  const url = new URL(process.env[name] ?? "");
  if (process.env.APP_ENVIRONMENT !== "staging" || process.env.STAGING_SUPABASE_PROJECT_REF !== ref || !(url.hostname === `db.${ref}.supabase.co` || (url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username).endsWith(`.${ref}`)))) throw new Error("Acceptance fixtures are restricted to the independent staging project");
}
if (!process.env.STAGING_SUPABASE_SECRET_KEY) throw new Error("STAGING_SUPABASE_SECRET_KEY is required in the protected staging environment");
const base = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3000";
if (base !== "http://127.0.0.1:3000") throw new Error("This workload targets the isolated runner production build only");
const duration = Number(process.env.ACCEPTANCE_DURATION_SECONDS ?? 1800);
if (duration !== 1800) throw new Error("Acceptance requires a full 30-minute workload");
const admin = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const service = createClient(`https://${ref}.supabase.co`, process.env.STAGING_SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID();
type Actor = { index: number; authId: string; userId: string; email: string; password: string; orgId: string; cookies: Map<string,string>; feature?: { id: string; revision: number; input: Record<string,unknown> }; writes: number };
const actors: Actor[] = []; const orgIds: string[] = [];
const metrics = { read: [] as number[], write: [] as number[], unexpected: 0, requests: 0, leakage: 0 };
const report: Record<string,unknown> = { runId, scope: "Production-mode Next.js build on an isolated GitHub runner, real staging Supabase Auth/Postgres. Hosted Vercel cold starts are not measured.", concurrency: 20, durationSeconds: duration, status: "running" };
let phase = "setup";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve,ms));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function request(actor: Actor, path: string, method = "GET", body?: unknown, expected = 200, measured = false, extra: Record<string,string> = {}) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { cookie: [...actor.cookies].map(([key,value]) => `${key}=${value}`).join("; "), origin: base, "content-type": "application/json", ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  const ms = performance.now()-started;
  if (measured) { metrics.requests++; metrics[method === "GET" ? "read" : "write"].push(ms); if (response.status>=500) metrics.unexpected++; }
  check(response.status === expected, `${phase}: ${method} request returned ${response.status}, expected ${expected}`);
  try { return JSON.parse(text); } catch { return text; }
}
const featureInput = (index: number, description = "Human-authored fixture work") => ({ name: `Acceptance feature ${index} ${runId}`, description, backlogLane: "unscheduled", backlogStatus: "planned", ownerUserId: null, isMvp: true, businessValue: "medium", riskLevel: "medium", dependsOnIds: [] });
const percentile = (values: number[], p: number) => [...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)] ?? null;
try {
  phase = "real test account provisioning";
  for (let index=0;index<21;index++) {
    const email = `clarivia.acceptance.${runId}.${index}@example.com`; const password = randomBytes(32).toString("base64url");
    const result = await service.auth.admin.createUser({ email,password,email_confirm: true,user_metadata: { name: `Acceptance test ${index}` } });
    check(!result.error && result.data.user, "Could not create an isolated staging Auth test account");
    actors.push({ index,authId: result.data.user.id,userId:"",email,password,orgId:"",cookies:new Map(),writes:0 });
  }
  for (let group=0;group<2;group++) {
    const owner = actors[group ? 20 : 0];
    const org = await admin.organization.create({ data: { name: `TEST ONLY acceptance ${runId} ${group}`,createdByAuthUserId:owner.authId } }); orgIds.push(org.id);
  }
  for (const actor of actors) {
    actor.orgId = orgIds[actor.index===20 ? 1 : 0];
    const user = await admin.user.create({ data: { authUserId:actor.authId,homeOrganizationId:actor.orgId,name:`Acceptance test ${actor.index}`,email:actor.email,memberType: actor.index===19 ? "external" : "internal" } }); actor.userId=user.id;
    await admin.organizationMember.create({ data: { organizationId:actor.orgId,authUserId:actor.authId,role:[0,20].includes(actor.index) ? "owner" : [1,19].includes(actor.index) ? "admin" : "member" } });
    const auth = createServerClient(`https://${ref}.supabase.co`, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll:()=>[...actor.cookies].map(([name,value])=>({name,value})),setAll: values=>{for(const cookie of values)actor.cookies.set(cookie.name,cookie.value);} } });
    const login = await auth.auth.signInWithPassword({email:actor.email,password:actor.password});
    check(!login.error && login.data.user?.id===actor.authId,"A real staging test account could not sign in");
  }
  for (const [group,index] of [[0,0],[1,20]]) await admin.organization.update({where:{id:orgIds[group]},data:{ownerUserId:actors[index].userId}});
  const drafts: string[] = [];
  for (const index of [0,20]) {
    const actor=actors[index]; const id=randomUUID();
    await request(actor,`/api/planning-drafts/${id}`,"PUT",{name:`Acceptance initiative ${index}`,problemStatement:"Preserve human planning edits during dependable collaboration",targetCustomer:"Product owners and their delivery teams",outcomeStatement:"Demonstrate safe workspace boundaries and reliable planning work",methodology:"agile_scrum"});
    await request(actor,`/api/planning-drafts/${id}/workspace`,"POST",{});
    await admin.intakeAnswerSet.update({where:{initiativeId:id},data:{teamSize:3}});
    drafts.push(id);
  }
  for(const actor of actors.slice(1,20)) await admin.initiativeAccess.create({data:{initiativeId:drafts[0],userId:actor.userId,permission:actor.index>=18 ? "view" : "edit"}});
  phase="signed-in role and navigation journeys";
  for(const actor of actors.slice(0,20)) {
    const home=await request(actor,"/home"); check(typeof home==="string" && !home.includes("NEXT_HTTP_ERROR_FALLBACK"),"Signed-in Home journey failed");
    const overview=await request(actor,`/initiatives/${drafts[0]}/overview`); check(typeof overview==="string" && overview.includes("Features") && overview.includes("Sprint"),"Five-tool guide was not available to an authorized account");
    if(actor.index>=18) await request(actor,`/api/initiatives/${drafts[0]}/backlog`,"POST",{action:"save",data:featureInput(actor.index)},403);
    else {
      const saved=await request(actor,`/api/initiatives/${drafts[0]}/backlog`,"POST",{action:"save",data:featureInput(actor.index)});
      actor.feature={id:saved.feature.id,revision:saved.feature.backlogRevision,input:featureInput(actor.index)};
    }
  }
  await request(actors[20],`/api/initiatives/${drafts[0]}/backlog`,"GET",undefined,404);
  const receipt=await request(actors[19],`/api/initiatives/${drafts[0]}/feedback/submissions`,"POST",{title:"Synthetic stakeholder feedback",details:"The narrow receipt must not expose internal planning scores or AI information."},201);
  check(Object.keys(receipt).join(",")==="receipt" && receipt.receipt.status==="received","Stakeholder feedback exposed more than a receipt");
  report.roleJourneys={signedInUsers:21,homeAndGuide:20,viewerAndExternalAdminWriteDenied:true,crossWorkspaceDenied:true,stakeholderReceiptOnly:true};
  phase="bounded AI use/edit/dismiss/stale journeys";
  const owner=actors[0];
  await request(owner,`/api/initiatives/${drafts[0]}/ai-assist/features`,"POST",{},503);
  const fresh=await withAuthenticatedDatabaseContext({authUserId:owner.authId,organizationId:owner.orgId},async()=>await computeFeatureProposalFingerprint(drafts[0]));
  const makeSuggestion=async(title:string,fingerprint=fresh)=>admin.aiAssistItem.create({data:{organizationId:owner.orgId,projectId:(await admin.initiative.findUniqueOrThrow({where:{id:drafts[0]}})).projectId,initiativeId:drafts[0],actionKey:"PROPOSE_FEATURES",targetType:"initiative",status:"proposed",fingerprint,aiModelUsed:"acceptance-fixture-no-provider-call",generatedByUserId:owner.userId,title,synopsis:title,proposedContentJson:JSON.stringify({name:title,description:"Reviewed synthetic proposal"})}});
  const dismissed=await makeSuggestion("Dismissed synthetic suggestion");
  await request(owner,`/api/ai-assist-items/${dismissed.id}/dismiss`,"POST",{reason:"Acceptance test dismissal"});
  const stale=await makeSuggestion("Stale synthetic suggestion","stale-fixture");
  await request(owner,`/api/ai-assist-items/${stale.id}/apply`,"POST",{},409);
  for(const edit of [false,true]) {
    const fingerprint=await withAuthenticatedDatabaseContext({authUserId:owner.authId,organizationId:owner.orgId},async()=>await computeFeatureProposalFingerprint(drafts[0]));
    const suggestion=await makeSuggestion(edit ? "Edited synthetic suggestion" : "Used synthetic suggestion",fingerprint);
    const result=await request(owner,`/api/ai-assist-items/${suggestion.id}/apply`,"POST",edit ? {editedContent:{name:"Human-edited synthetic proposal",description:"Human-reviewed content"}} : {});
    check(result.item.status===(edit ? "edited_and_applied" : "applied"),"AI user decision was not recorded accurately");
    check(await admin.artifactLayer.count({where:{sourceCapabilityId:result.applied.appliedEntityId,type:"feature",archivedAt:null}})===1,"Accepted AI feature did not use one canonical projection");
  }
  report.ai={providerUnavailable503:true,providerCalls:0,syntheticSuggestions:true,use:true,edit:true,dismiss:true,staleRejected:true,externalFailureControls:"Separate affected tests verify provider outage/timeout/budget rejection and usage evidence; no paid provider acceptance is claimed."};
  const allowedFeatures=new Set((await admin.capability.findMany({where:{intakeAnswerSet:{initiativeId:drafts[0]}},select:{id:true}})).map(row=>row.id));
  phase="30-minute, 20-concurrent-user workload";
  const start=Date.now();
  let abortLoad=false;
  const results=await Promise.allSettled(actors.slice(0,20).map(async(actor)=>{
    try {
    await sleep(actor.index*400);
    let iteration=0;
    while(!abortLoad && Date.now()-start<duration*1000){
      const result=await request(actor,`/api/initiatives/${drafts[0]}/backlog`,"GET",undefined,200,true);
      if(!result.features.every((row:{id:string})=>allowedFeatures.has(row.id))){metrics.leakage++;throw new Error("Unexpected record entered the authorized workspace response");}
      if(actor.feature && iteration%6===0){
        const input={...actor.feature.input,description:`Human load edit ${actor.index} ${actor.writes+1}`};
        const saved=await request(actor,`/api/initiatives/${drafts[0]}/backlog`,"POST",{action:"save",data:input,existing:{id:actor.feature.id,revision:actor.feature.revision},reason:"Controlled acceptance workload"},200,true);
        actor.feature.revision=saved.feature.backlogRevision;actor.feature.input=input;actor.writes++;
      }
      iteration++;await sleep(10_000);
    }
    } catch(error){abortLoad=true;throw error;}
  }));
  const failure=results.find(result=>result.status==="rejected");if(failure?.status==="rejected")throw failure.reason;
  report.actualDurationSeconds=(Date.now()-start)/1000;
  phase="loss/duplicate verification and queue drain";
  for(const actor of actors)if(actor.feature){const row=await admin.capability.findUniqueOrThrow({where:{id:actor.feature.id}});check(row.backlogRevision===1+actor.writes && row.description===actor.feature.input.description,"A planning write was lost or duplicated");}
  check(await admin.capability.count({where:{intakeAnswerSet:{initiativeId:drafts[0]}}})===allowedFeatures.size,"Duplicate canonical features appeared");
  const layerCount=await admin.artifactLayer.count({where:{prototype:{initiativeId:drafts[0]}}});
  const jobIds=new Set<string>();const drainStarted=Date.now();
  for(let index=0;index<3;index++)for(let duplicate=0;duplicate<2;duplicate++){const result=await request(owner,`/api/initiatives/${drafts[0]}/generate`,"POST",{},202,false,{"idempotency-key":`${runId}-drain-${index}`});jobIds.add(result.jobId);}
  check(jobIds.size===3,"Repeated enqueue created duplicate jobs");
  while(Date.now()-drainStarted<300_000){const jobs=await admin.backgroundJob.findMany({where:{id:{in:[...jobIds]}}});if(jobs.length===3 && jobs.every(row=>row.status==="completed"))break;await sleep(5000);}
  const jobs=await admin.backgroundJob.findMany({where:{id:{in:[...jobIds]}}});
  check(jobs.length===3 && jobs.every(row=>row.status==="completed"),"Queued test work did not complete within five minutes");
  check(await admin.artifactLayer.count({where:{prototype:{initiativeId:drafts[0]}}})===layerCount,"Queued regeneration replaced live planning work");
  report.queueDrainSeconds=(Date.now()-drainStarted)/1000;
  await admin.organizationMember.updateMany({where:{organizationId:orgIds[0],authUserId:actors[17].authId},data:{status:"revoked"}});
  await request(actors[17],`/api/initiatives/${drafts[0]}/backlog`,"GET",undefined,401);
  report.revokedSessionDenied=true;
  const readP95=percentile(metrics.read,.95),writeP95=percentile(metrics.write,.95),errorRate=metrics.unexpected/Math.max(1,metrics.requests);
  report.workload={reads:metrics.read.length,writes:metrics.write.length,readP95Ms:readP95,writeP95Ms:writeP95,unexpectedServerErrorRate:errorRate,tenantLeakage:metrics.leakage,lostOrDuplicateWrites:0};
  check(readP95!==null && readP95<=2000,"Read p95 exceeded two seconds");check(writeP95!==null && writeP95<=3000,"Write p95 exceeded three seconds");check(errorRate<.01 && metrics.leakage===0,"Server-error or isolation acceptance threshold failed");
  report.status="passed";
}catch(error){report.status="failed";report.failureStage=phase;report.failure=error instanceof Error ? error.message : "Acceptance failed";process.exitCode=1;}
finally{
  // Retain immutable test audit evidence; retire memberships and Auth accounts from this run only.
  let retired=0;
  for(const actor of actors){
    if(actor.userId){await admin.user.update({where:{id:actor.userId},data:{status:"disabled"}});await admin.organizationMember.updateMany({where:{authUserId:actor.authId,organizationId:{in:orgIds},role:{not:"owner"}},data:{status:"revoked"}});}
    const result=await service.auth.admin.deleteUser(actor.authId);if(!result.error)retired++;
  }
  for(const id of orgIds)await admin.organization.update({where:{id},data:{name:`RETIRED TEST ONLY acceptance ${runId}`}});
  report.cleanup={createdAuthAccounts:actors.length,retiredAuthAccounts:retired,planningAuditEvidenceRetained:true};
  if(retired!==actors.length){report.status="failed";report.cleanupFailure=true;process.exitCode=1;}
  await mkdir(".tmp-tests",{recursive:true});await writeFile(".tmp-tests/staging-acceptance.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));await admin.$disconnect();await rawDb.$disconnect();
}

}
void main().catch(async () => { console.error("Acceptance runner failed before reporting; no credentials logged."); process.exitCode=1; await rawDb.$disconnect(); });
