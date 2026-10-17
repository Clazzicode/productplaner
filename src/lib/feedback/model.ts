import { z } from "zod";import { priorityFactorsSchema,priorityLanes,priorityMoscowValues } from "@/lib/prioritization/model";
const id=z.string().trim().min(1).max(191);const reason=z.string().trim().min(3).max(1000);const link=z.object({entityType:z.enum(["request","feature","story","bug","sprint","release","meeting","demo","validation"]),entityId:id}).nullable();
export const feedbackCreateSchema=z.object({title:z.string().trim().min(3).max(300),details:z.string().trim().min(3).max(30_000),source:z.enum(["customer","stakeholder","demo","sprint_review","release","meeting","support","jira","manual"]),sourceReference:z.string().trim().max(2000).nullable(),category:z.enum(["general","request","quality","usability","scope","delivery","risk"]),link}).strict();
const proposal=z.object({entityType:z.enum(["request","feature","story"]),entityId:id,expectedEntityRevision:z.number().int().positive(),factors:priorityFactorsSchema,moscow:z.enum(priorityMoscowValues),roadmapLane:z.enum(priorityLanes),rationale:z.string().trim().min(3).max(8000),source:z.enum(["manual","ai"]),suggestionId:id.nullable().optional()}).strict().superRefine((v,c)=>{if(v.source==="ai"&&!v.suggestionId)c.addIssue({code:"custom",path:["suggestionId"],message:"Choose the AI suggestion being used."});if(v.source==="manual"&&v.suggestionId)c.addIssue({code:"custom",path:["suggestionId"],message:"Manual proposals cannot reference an AI suggestion."});});
export const feedbackCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("update"),expectedRevision:z.number().int().positive(),title:z.string().trim().min(3).max(300),details:z.string().trim().min(3).max(30_000),category:z.enum(["general","request","quality","usability","scope","delivery","risk"]),status:z.enum(["captured","triaged","actioned","closed"]),summary:z.string().trim().max(20_000),link,reason}).strict(),
 z.object({action:z.literal("create_follow_up"),expectedRevision:z.number().int().positive(),title:z.string().trim().min(3).max(300),requestedChange:z.string().trim().min(3).max(8000),reason}).strict(),
 z.object({action:z.literal("use_summary"),expectedRevision:z.number().int().positive(),suggestionId:id,summary:z.string().trim().min(3).max(20_000),reason}).strict(),
 z.object({action:z.literal("create_proposal"),expectedRevision:z.number().int().positive(),proposal,reason}).strict(),
]);
export const proposalCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("apply"),expectedRevision:z.number().int().positive(),decisionReason:z.string().trim().min(3).max(8000)}).strict(),
 z.object({action:z.literal("dismiss"),expectedRevision:z.number().int().positive(),decisionReason:z.string().trim().min(3).max(8000)}).strict(),
]);
export const feedbackAiSchema=z.object({kind:z.enum(["summary","reprioritization"])}).strict();export const feedbackSuggestionSchema=z.object({action:z.literal("dismiss")}).strict();
export type FeedbackCommand=z.infer<typeof feedbackCommandSchema>;export type ProposalCommand=z.infer<typeof proposalCommandSchema>;
