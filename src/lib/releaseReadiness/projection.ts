import { Prisma } from "@prisma/client";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";

export type ReadinessCheck = { checkKey:string; label:string; status:"pass"|"warning"|"fail"; explanation:string; evidence:Prisma.InputJsonObject };

export async function buildReleaseReadinessProjection(initiativeId:string,releaseId:string){
  const release=await db.release.findFirst({where:{id:releaseId,prototype:{initiativeId}},select:{id:true,name:true,targetDate:true,order:true,phaseNumber:true,prototype:{select:{initiative:{select:{id:true,name:true,organizationId:true,projectId:true,releaseCadence:true,customReleaseCadence:true}}}},sprints:{select:{id:true,sprintNumber:true,status:true,startDate:true,endDate:true,sprintPlan:{select:{id:true,status:true,items:{select:{storyId:true,bugId:true,carryoverReason:true}}}}},orderBy:{sprintNumber:"asc"}}}});
  if(!release)throw new BusinessError("Release not found.",404);
  const initiative=release.prototype.initiative;const sprintIds=release.sprints.map(s=>s.id);const plannedStories=release.sprints.flatMap(s=>s.sprintPlan?.items.filter(i=>i.storyId).map(i=>({sprintId:s.id,storyId:i.storyId!}))??[]);
  const[reviews,validations,blockers,bugs,dependencies]=await Promise.all([
    db.sprintReview.findMany({where:{initiativeId,sprintId:{in:sprintIds}},select:{sprintId:true,status:true}}),
    db.productValidation.findMany({where:{initiativeId,sprintId:{in:sprintIds},storyId:{in:plannedStories.map(x=>x.storyId)}},select:{sprintId:true,storyId:true,status:true,sequence:true},orderBy:{sequence:"desc"}}),
    db.planningBlocker.findMany({where:{initiativeId,status:{in:["open","in_progress"]},OR:[{releaseId},{sprintId:{in:sprintIds}}]},select:{id:true,blockerType:true,status:true,description:true,sprintId:true,releaseId:true}}),
    db.bugPlanningRecord.findMany({where:{initiativeId,archivedAt:null,status:{notIn:["closed","resolved","accepted"]},OR:[{affectedReleaseId:releaseId},{affectedSprintId:{in:sprintIds}}]},select:{id:true,severity:true,status:true,priority:true,request:{select:{data:true}}}}),
    db.workDependency.findMany({where:{initiativeId,OR:[{predecessorReleaseId:releaseId},{dependentReleaseId:releaseId},{predecessorSprintId:{in:sprintIds}},{dependentSprintId:{in:sprintIds}}]},select:{id:true,dependencyType:true,description:true}}),
  ]);
  const latest=new Map<string,string>();for(const row of validations){const key=`${row.sprintId}:${row.storyId}`;if(!latest.has(key))latest.set(key,row.status);}
  const accepted=plannedStories.filter(x=>latest.get(`${x.sprintId}:${x.storyId}`)==="accepted").length;
  const committed=release.sprints.filter(s=>s.sprintPlan?.status==="committed").length;
  const finalizedReviews=new Set(reviews.filter(r=>r.status==="finalized").map(r=>r.sprintId));
  const carryover=release.sprints.flatMap(s=>s.sprintPlan?.items.filter(i=>i.carryoverReason.trim()).map(i=>({sprintId:s.id,storyId:i.storyId,bugId:i.bugId,reason:i.carryoverReason}))??[]);
  const severeBugs=bugs.filter(b=>["critical","high"].includes(b.severity));
  const cadence=initiative.releaseCadence==="custom"?initiative.customReleaseCadence:initiative.releaseCadence;
  const checks:ReadinessCheck[]=[
    {checkKey:"release_context",label:"Release date and cadence",status:release.targetDate&&cadence?"pass":"fail",explanation:release.targetDate&&cadence?`Target release date and ${cadence} cadence are recorded.`:"Record both the target release date and release cadence.",evidence:{targetDate:release.targetDate.toISOString(),cadence}},
    {checkKey:"committed_sprints",label:"Committed sprint plans",status:release.sprints.length>0&&committed===release.sprints.length?"pass":"fail",explanation:`${committed} of ${release.sprints.length} release sprints have committed plans.`,evidence:{committed,total:release.sprints.length}},
    {checkKey:"sprint_reviews",label:"Sprint reviews",status:release.sprints.length>0&&finalizedReviews.size===release.sprints.length?"pass":"fail",explanation:`${finalizedReviews.size} of ${release.sprints.length} sprint reviews are finalized.`,evidence:{finalized:finalizedReviews.size,total:release.sprints.length}},
    {checkKey:"po_validation",label:"PO validation",status:plannedStories.length>0&&accepted===plannedStories.length?"pass":"fail",explanation:`${accepted} of ${plannedStories.length} planned stories have a latest accepted PO validation.`,evidence:{accepted,total:plannedStories.length}},
    {checkKey:"blockers",label:"Open blockers",status:blockers.length?"fail":"pass",explanation:blockers.length?`${blockers.length} unresolved blocker(s) affect this release.`:"No unresolved blockers affect this release.",evidence:{count:blockers.length,items:blockers as unknown as Prisma.InputJsonValue}},
    {checkKey:"quality",label:"Quality and bugs",status:severeBugs.length?"fail":bugs.length?"warning":"pass",explanation:severeBugs.length?`${severeBugs.length} critical/high open bug(s) affect this release.`:bugs.length?`${bugs.length} lower-severity open bug(s) affect this release.`:"No open bugs are assigned to this release.",evidence:{open:bugs.length,severe:severeBugs.length}},
    {checkKey:"dependencies",label:"Dependencies",status:dependencies.length?"warning":"pass",explanation:dependencies.length?`${dependencies.length} dependency link(s) require confirmation before release.`:"No recorded dependency links require release confirmation.",evidence:{count:dependencies.length}},
    {checkKey:"carryover",label:"Carryover and incomplete work",status:carryover.length?"warning":"pass",explanation:carryover.length?`${carryover.length} planned item(s) record carryover.`:"No planned release item records carryover.",evidence:{count:carryover.length,items:carryover as unknown as Prisma.InputJsonValue}},
  ];
  const snapshot={release:{id:release.id,name:release.name,targetDate:release.targetDate.toISOString(),order:release.order,phaseNumber:release.phaseNumber},initiative:{id:initiative.id,name:initiative.name,releaseCadence:initiative.releaseCadence,customReleaseCadence:initiative.customReleaseCadence},sprints:release.sprints.map(s=>({id:s.id,sprintNumber:s.sprintNumber,status:s.status,startDate:s.startDate.toISOString(),endDate:s.endDate.toISOString(),planStatus:s.sprintPlan?.status??null,plannedItemCount:s.sprintPlan?.items.length??0})),counts:{plannedStories:plannedStories.length,acceptedValidations:accepted,openBlockers:blockers.length,openBugs:bugs.length,severeBugs:severeBugs.length,dependencies:dependencies.length,carryover:carryover.length}} as Prisma.InputJsonObject;
  return{organizationId:initiative.organizationId,projectId:initiative.projectId,initiativeId:initiative.id,releaseSnapshot:snapshot,checks};
}

