/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS audit fixture */
// Read-only audit reproduction. Executes the actual route with a database
// double holding an approved Waterfall plan. Does not contact any service.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const state = { methodology: 'waterfall', approvedAt: '2026-09-25T12:00:00Z', sprintId: null, sprints: [], auditEvents: [] };
const db = {
  release: { findUnique: async () => ({ id: 'release', origin: 'manual', phaseNumber: 1, prototype: { id: 'prototype', initiativeId: 'initiative' } }) },
  initiative: { findUniqueOrThrow: async () => ({ methodology: state.methodology, prototype: { approvedAt: state.approvedAt } }) },
  artifactLayer: {
    findMany: async () => [{ id: 'story', parent: { parent: { parent: { contentJson: '{"phaseNumber":1}' } } } }],
    updateMany: async ({ data }) => { state.sprintId = data.sprintId; return { count: 1 }; },
  },
  sprint: {
    aggregate: async () => ({ _max: { sprintNumber: null } }),
    create: async ({ data }) => { const sprint = { id: 'new-sprint', ...data }; state.sprints.push(sprint); return sprint; },
  },
  auditEvent: { create: async ({ data }) => { state.auditEvents.push(data); } },
};
const body = { startDate: new Date('2026-10-01'), endDate: new Date('2026-10-14'), capacityPoints: 20, storyIds: ['story'] };
const modules = {
  '@/lib/observability': { withApi: handler => handler },
  'next/server': { NextResponse: { json: data => ({ status: 200, data }) } },
  '@/lib/access/guards': { requireInitiativeApiAccess: async () => ({ ok: true }) },
  '@/lib/api': { jsonError: (error, status) => ({ error, status }), zodMessage: String },
  '@/lib/auth/session': { requireCurrentUserApi: async () => ({ ok: true, user: { authUserId: 'verified-user' } }) },
  '@/lib/db': { db, establishAuthContext: () => {}, withTransaction: fn => fn(db) },
  '@/lib/validation/schemas': { createSprintSchema: { safeParse: () => ({ success: true, data: body }) } },
};
const code = ts.transpileModule(fs.readFileSync('src/app/api/releases/[releaseId]/sprints/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(code, { exports: exportsObject, require: name => {
  if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
  return modules[name];
} });
(async () => {
  const result = await exportsObject.POST({ json: async () => body }, { params: Promise.resolve({ releaseId: 'release' }) });
  console.log(JSON.stringify({ mockedDatabase: true, status: result.status, methodology: state.methodology,
    approvedAtAfter: state.approvedAt, newSprintCount: state.sprints.length, assignedStorySprint: state.sprintId,
    auditEventCount: state.auditEvents.length }, null, 2));
  if (result.status !== 200 || state.sprints.length !== 1 || state.sprintId !== 'new-sprint') process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
