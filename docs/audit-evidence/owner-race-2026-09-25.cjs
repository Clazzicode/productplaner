/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS audit fixture */
// Read-only audit reproduction: execute the real service against an in-memory
// database double. No application files or live database records are modified.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/access/mutations.ts', 'utf8');
const grants = new Map(['a', 'b'].map(id => [id, {
  id, initiativeId: 'initiative', userId: `user-${id}`, permission: 'owner',
  initiative: { organizationId: 'org' },
}]));
let countCalls = 0;
let releaseCounts;
const bothCounts = new Promise(resolve => { releaseCounts = resolve; });
const db = { initiativeAccess: {
  findUnique: async ({ where }) => grants.get(where.id),
  count: async ({ where }) => {
    const count = [...grants.values()].filter(g => g.id !== where.id.not && g.permission === 'owner').length;
    if (++countCalls === 2) releaseCounts();
    await bothCounts;
    return count;
  },
  delete: async ({ where }) => { grants.delete(where.id); },
} };
const exportsObject = {};
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
vm.runInNewContext(js, {
  exports: exportsObject,
  require: name => name === '@/lib/db' ? { db } : {},
});
(async () => {
  const results = await Promise.all([
    exportsObject.revokeGrant('a', 'org'),
    exportsObject.revokeGrant('b', 'org'),
  ]);
  const remainingOwners = [...grants.values()].filter(g => g.permission === 'owner').length;
  console.log(JSON.stringify({ reproduction: 'concurrent owner revocation', mockedDatabase: true, results, remainingOwners }, null, 2));
  if (!results.every(r => r.ok) || remainingOwners !== 0) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
