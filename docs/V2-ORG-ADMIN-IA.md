# V2 Organization Admin — Information Architecture & Management Workflows (Step 8A)

Status: **Documentation only as originally written.** No Prisma changes, no migrations, no
application code, no database writes were made in Step 8A itself. This document extends
`docs/V2-ACCESS-TEAMS-VISIBILITY.md` (Step 7A, the authorization model) and
`docs/V2-STANDARD-DASHBOARD.md` (Step 7B, the widget registry Dashboard Configuration will
eventually control) with how an Organization Admin actually manages Users, Teams, Access, External
Users, Dashboard Configuration, and Organization Settings as one coherent experience. Target:
organizations of roughly 10–50 users; an admin who is a product/project/PMO/ops lead, not a
security specialist. Nothing here should feel like Azure AD, Okta, or an RBAC matrix.

**Since implemented:** Users + Teams (Step 8B, `docs/V2-USERS-TEAMS.md`), Resource Access
(Step 8C, `docs/V2-RESOURCE-ACCESS.md`), the Admin Dashboard (Step 8D,
`docs/V2-ORG-ADMIN-DASHBOARD.md`), and Dashboard Configuration (Step 8E,
`docs/V2-DASHBOARD-CONFIGURATION.md`) — see the "Implemented at Step 8C"/§12 notes inline in §9/§10/
§12/§14/§16/§21/§22 below and the Implementation Sequence at the end.

---

## 1. Admin Mental Model

```
Organization
 └─ Users            "Who is in my organization?"
     └─ Teams        "Which team are they on?"
         └─ Initiatives / Access   "What can they access, and why?"
             └─ Dashboard Experience   "What do they see day to day?"
```

Every admin screen answers one or more of: Who is in my organization? Which team are they on?
What can they access? Why do they have access? What happens if I remove them? Which
clients/external users exist? Which dashboard experience do employees receive? Which initiatives
are visible to which teams? Section 8/9 below make sure no two screens answer these questions
inconsistently — there is exactly one underlying data model (Step 7A's `TeamMember` +
`InitiativeAccess`), and every screen is a different lens over it, never a parallel system.

---

## 2. Recommended Admin Navigation

Today's ADMIN nav group (`docs/V2-APPLICATION-SHELL-BLUEPRINT.md` §2, unchanged in code): Users &
Roles, Organization, Dashboard Configuration, Settings — all currently disabled placeholders.
ORGANIZATION already has Teams & Stakeholders, visible to every user, not just admins.

**Recommendation — five ADMIN items, and Teams deliberately stays out of ADMIN:**

| Nav item | Group | Audience | Change from today |
|---|---|---|---|
| **Users** | ADMIN | Org Admin only | Renamed from "Users & Roles" — "Roles" undersells it now that Access Level, Working Role, and Member Type are all distinct concepts; "Users" covers all three without implying just one |
| **Access** | ADMIN | Org Admin only | **New.** Org-wide "who can access what" — the resource-centric entry point (§9) |
| **Dashboard Configuration** | ADMIN | Org Admin only | Unchanged |
| **Organization** | ADMIN | Org Admin only | Unchanged, scope clarified (§13) |
| **Settings** | ADMIN | Org Admin only | Unchanged, scope clarified (§13) |
| Teams & Stakeholders | ORGANIZATION | Everyone, admin-aware | Unchanged nav location — see below |

**Why Teams doesn't get a new ADMIN slot:** it already has a well-placed, correctly-scoped
destination — every user, not just admins, legitimately wants to see team rosters
(`docs/V2-APPLICATION-SHELL-BLUEPRINT.md`'s own ORGANIZATION group already reflects this). Adding
a second "Teams" under ADMIN would either duplicate that page or split team information across two
disconnected screens — exactly the "siloed screens" problem §8 below warns against. Instead, **the
same Teams & Stakeholders page becomes admin-aware**: a Standard User sees rosters read-only; an
Organization Admin sees the same page with create/rename/add-remove-member/manage-access controls
inline. One page, one URL, capability gated by Access Level — not two pages.

This also directly answers the prompt's "Users & Teams vs. separate" question: **keep them
separate**, but not for the reason offered (parity of two similar destinations) — because Teams
already belongs to a different, correctly-broader audience than Users management does, so merging
them would either move Teams out of general reach or bolt admin-only content onto a page most
viewers shouldn't see the controls for.

**Access** is genuinely new: neither "Users" nor "Teams & Stakeholders" is a good home for "pick an
initiative, see everyone who can reach it" — that's the third of the three entry points in §9, and
it deserves its own destination rather than being buried as a tab inside something else.

Not changed in code this phase — this is the recommendation Step 8B implements against.

---

## 3. Users Workflow

**Users List** — compact, CRM-density table (per the Step 6 "Data Table" layout mode,
`docs/V2-APPLICATION-SHELL-BLUEPRINT.md` §8, still unapplied anywhere — this would be its first
real adopter). Columns: Name, Email, Working Role, Access Level, Member Type, Team(s), Status.
"Last Activity" is listed as future — no activity/session data exists yet (`docs/V2-ARCHITECTURE.md`
§10), so it's omitted from MVP rather than shown as a fake column.

Filters: Active/Disabled, Internal/External, Working Role, Team, Access Level — all cheap
column-equality filters, no saved-filter/query-builder complexity.

Primary action: **Invite User** (internal) — External invitation is a distinct flow, §11.

---

## 4. User Detail

Sections, in order:

1. **Profile** — name, email, status.
2. **Organization Authority** — Access Level (Standard User / Organization Admin), editable by
   another Org Admin only (§15 — an admin can't act on their own authority in ways that could lock
   the org out).
3. **Working Role** — Product Management / Project Manager / Developer. Presentation-only
   (`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §2) — editing it here changes dashboard emphasis, never
   access.
4. **Member Type** — Internal / External-Guest.
5. **Teams** — every team this user belongs to, each linking to that Team Detail (§7).
6. **Resource Access** — every initiative this user can reach, **with the why** (§10):

   ```
   Initiative A     Edit     via Product Team
   Initiative B     View     Direct grant
   Initiative C     Edit     via Product Team + Direct
   ```

   Each row links to that Initiative's own Access view (§9), completing the cross-navigation loop.

This is the single canonical "why does this person have access to anything" screen — it's a read
of the same resolution function described in `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §5, not a
separate computation.

---

## 5. Disable / Re-enable / Remove

**Disable vs. Remove are different weights of action and must stay visually and behaviorally
distinct** — the prompt's own instinct (accidental permanent deletion should be hard) is correct
for a 10–50 person org where the admin is often not a security specialist.

**Disable (Option A recommended — preserve, don't delete):** disabling a user keeps their
`TeamMember` and `InitiativeAccess` rows intact; the user simply can't sign in or have any
authorization check succeed while disabled (`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §6 — "user
disabled" already specifies this). Re-enabling restores exactly the prior configuration with zero
rebuild work. **Why Option A over Option B:** temporary offboarding (leave, contractor pause,
seasonal role) is common at this size, and "disable" only earns its place as a distinct, lighter
action if it's actually cheap to reverse — if it deleted grants, disable would just be delete with
extra steps, and the admin would have no reason to ever use it over Remove.

Before confirming Disable, show the impact plainly: sign-in and all resource access stop
immediately; team memberships remain stored for recordkeeping and will resume access on
re-enable; an audit event is recorded (§18).

**Permanent removal is intentionally two different, size-appropriate actions, not one:**

| Action | Applies to | Behavior | Reversible? |
|---|---|---|---|
| **Disable** | Internal or External | Preserve everything, block access (above) | Yes — Re-enable |
| **Remove external user** | External only | Deletes their grants; low blast radius since externals never had org-wide visibility to begin with (`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §6) | No — re-inviting rebuilds from scratch |
| **Archive internal user** | Internal only | Soft-delete: same effect as Disable, but marks the account as permanently departed rather than "temporarily away" for reporting purposes | Admin-reversible, but not meant to be routine |

**No hard delete of an internal user in MVP.** A true destructive purge (erasing the row and its
history) is Enterprise Later (§21) — nothing about a 10–50 person org needs it, and it directly
conflicts with "accidental permanent deletion should be difficult."

---

## 6. Teams Workflow

Teams & Stakeholders (admin-aware, §2) lists every team:

```
Product         8 members    3 initiatives
Engineering     12 members   4 initiatives
Leadership      5 members    6 initiatives
Client — Acme   3 external   1 initiative
```

Admin actions from the list: **Create team** (name only, per `docs/V2-ACCESS-TEAMS-VISIBILITY.md`
§3's flat, no-team-roles MVP), rename, open a team's detail. No nested teams in MVP (§3, unchanged
from Step 7A).

---

## 7. Team Detail

1. **Members** — who's on the team; add/remove inline (impact preview on remove, §8).
2. **Initiative Access** — every initiative this team can reach:
   ```
   Customer Portal   Edit
   Mobile App        View
   ```
   Add/change/revoke here uses the identical grant flow as §9/§10 — this is the team-centric lens
   on the same `InitiativeAccess` rows, not a separate list.
3. **Member Composition** — Internal/External counts, useful at a glance for a client-only team
   like "Client — Acme" without opening every member.
4. **Activity** — future, permission-related events only for this team (§18); not built now.

---

## 8. Team Membership Change (impact preview)

Exact behavior, restating `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §5–§6 in UI terms:

- Jane has Initiative A **only** through Engineering → removing her from Engineering removes
  Initiative A entirely.
- Jane also holds a direct View grant on Initiative A → removing her from Engineering **downgrades**
  her to View (she doesn't lose access, because highest-wins now resolves to the remaining direct
  grant).

**The impact preview itself — in some form — is MVP, not Phase 2.** Step 7A requires resolution to
be "predictable to a non-technical admin" (`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §5); silently
changing someone's access with no explanation before the click would violate that. What's Phase 2
is the **polish**: MVP shows a plain-text summary ("Removing Jane from Engineering will change
Customer Portal from Edit to View, because of her separate direct grant"), computed by literally
calling the same resolution function twice (before/after) and diffing the result — cheap, no new
logic. A richer, multi-row visual diff table across every affected initiative is a Phase 2
refinement of presentation, not of correctness.

---

## 9. Resource Access Workflow

**Implemented at Step 8C** (`docs/V2-RESOURCE-ACCESS.md` §15) as `/admin/access` (the picker) →
`/admin/access/[initiativeId]` (this screen), built exactly as designed below — Teams and
Individuals sections, no ACL jargon, Owner never offered for a team.

Initiative-centric view (also reachable from the new **Access** nav item, §2, which is just an
initiative picker in front of this same screen):

```
Customer Portal

Teams
  Product        Owner
  Engineering    Edit
  Leadership     View

Individuals
  Jane Smith     View
  Client User    View
```

Actions: **Add team access**, **Add individual access**, **change permission**, **revoke access**
— all operating on the same three-level vocabulary as everywhere else, no ACL jargon anywhere in
the UI (no "grant," "ACE," "principal" — just "who" and "what level").

**Access levels, restated in admin-facing language** (`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §4):

| Label | Meaning shown to the admin |
|---|---|
| **Owner** | Full initiative management, including who else has access. Exactly one per initiative. |
| **Edit** | Can change planning content. |
| **View** | Read-only. |

These three labels remain understandable without further explanation — confirmed by design, not
by testing yet. No action-level permission matrix (who can lock a layer vs. who can rename a
sprint, etc.) is introduced — Step 7A already rejected finer granularity for this org size, and
nothing in this phase's analysis found a reason to revisit that.

---

## 10. Grant / Downgrade / Revoke

**Implemented at Step 8C**: the plain-text impact preview (not the richer visual diff table —
that's still Phase 2, unchanged) is real, built on the exact same resolution function every other
access decision uses (`docs/V2-RESOURCE-ACCESS.md` §9), and verified live for both a permission
change and a revoke.

**Permission Source — every resolved-access row shows its origin, always:**

```
Edit    via Product
View    Direct
Edit    via Product + PMO
Edit    via Product + Direct
```

Grammar: a single team source → "via {Team}"; a direct-only grant → "Direct"; multiple sources →
"via {Team} + {Team}" or "via {Team} + Direct". This is a straight read of
`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §5's resolution inputs — every source that contributed to the
highest-wins result is named, nothing is summarized away.

**Grant Access flow — one flow, no wizard:**

```
Add Access → Choose Team or Person → Search → Choose permission (Owner / Edit / View*) → Confirm
```
*Owner only offered when adding an individual, never a team (§4/§7A). When the grantee is External,
the permission choice **doesn't render Edit or Owner at all** — see §15.

**Revoke Access flow — impact stated before the click, not after:**

```
Jane currently has Edit access through:
  • Product Team
  • Direct View

Removing her direct View grant will NOT reduce her access — Product Team still grants Edit.
```
or
```
Removing Jane from Product will change her access:
  Customer Portal   Edit → View
```
or
```
This is Jane's only source of access to Customer Portal.
Removing it will remove her access entirely.
```

Same MVP/Phase-2 split as §8: the plain-text impact statement is MVP (cheap, correctness-critical);
a richer visual before/after treatment is Phase 2.

---

## 11. External / Client Users

**No separate admin product or separate user model.** External/Guest users appear in the same
Users list (§3) with `Member Type = External` and a visible badge — consistent with
`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §17's explicit rejection of a separate `ClientPortalUser`
model. Rules enforced structurally, not just by admin discipline:

- External users receive **only explicit** resource access — never implicit org-wide visibility
  (unlike Organization Admin's implicit access, §7A §5).
- External users are **View-only** — the permission picker doesn't offer Edit/Owner for an
  external grantee (§15), so this isn't an admin discipline problem, it's structurally impossible.
- External users never receive sensitive internal data (cost, capacity, internal risks/decisions)
  regardless of grant, per `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §9.

**External users can belong to teams**, and a client-scoped team (e.g. "Client — Acme") is
recommended as the default pattern for any client with more than one person — it's the same
`Team`/`TeamMember` model as an internal team (no new type needed), and it makes managing several
people from one client a single grant instead of N individual grants.

**External User Onboarding (workflow only, no email implementation):**

```
Invite External User
  → Name / Email
  → Client / Team (optional)
  → Choose Initiative
  → Access level: View (fixed, not selectable)
  → Send invite
```

---

## 12. Dashboard Configuration

**Implemented at Step 8E** (`docs/V2-DASHBOARD-CONFIGURATION.md`), built exactly against the
visibility-only, per-Working-Role scope designed below — including Reset to Default and the
Organization → Working Role → Widget Visibility hierarchy, with no team-level or individual
overrides added.

Builds directly on `docs/V2-STANDARD-DASHBOARD.md` §5's `widgetRegistry.ts` (`DASHBOARD_WIDGETS`,
`ROLE_WIDGET_ORDER`, `defaultVisible`).

**MVP: visibility only, not ordering.** Admin picks a Working Role, sees its widgets, toggles each
on/off:

```
Product Management
  Visible:  Plan Health · Roadmap Snapshot · Your Initiatives · Upcoming Timeline
  Hidden:   Current Focus
```

**Why visibility-only, not visibility+ordering, for MVP:** Step 7B already shipped a considered
default order per role (`docs/V2-STANDARD-DASHBOARD.md` §7) grounded in what each role actually
needs first. Letting an admin reorder risks an org accidentally burying the widget that role most
needs, with no clear benefit at this size — whereas hiding a widget the org doesn't use (e.g. no
one uses Recent Activity) is an obviously useful, low-risk lever. Ordering customization is Phase 2,
only if real usage shows the fixed order is wrong for a specific org.

**Hierarchy — Organization → Working Role → Widget visibility is the correct and only MVP scope.**
Team-level configuration and individual override are explicitly **not built unless justified** —
`docs/V2-STANDARD-DASHBOARD.md` §9 already anticipated exactly this extension point
(`defaultVisible`) without committing to how far it goes; this phase's answer is: not past
Working Role for MVP.

**Reset to Defaults** — one button per role (`Reset Product Management Dashboard to Default`, etc.)
restoring `ROLE_WIDGET_ORDER`'s built-in order/visibility. Cheap, and important: a config mistake
should never require the admin to remember what the defaults were.

**The security rule, restated explicitly because it's the one that must never regress:**
Dashboard Configuration is presentation. If an admin enables Cost Forecast for Developers who
aren't authorized to see cost data, **the backend still omits it** — the widget renders empty or
not at all, it does not leak data because an admin toggled a switch.
`docs/V2-STANDARD-DASHBOARD.md` §8 already enforces this by not shipping a Cost widget at all
until real authorization exists; this phase doesn't relax that.

---

## 13. Organization vs. Settings

| Organization | Settings |
|---|---|
| What this org **is** and who **runs** it | How this org wants planning to **behave** by default |
| Organization name, company size, industry, status | Default methodology, default sprint length/capacity assumptions |
| List of current Organization Admins (ties directly to the "can't remove the last admin" safeguard, §15) | Notification preferences |
| — | Integration defaults |
| — | Security preferences (mostly not applicable yet — no real auth/session model, `docs/V2-ARCHITECTURE.md` §10) |

Rule of thumb: **Organization answers "what/who," Settings answers "how."** Neither is built this
phase.

---

## 14. Admin Dashboard Purpose

**Implemented at Step 8D** (`docs/V2-ORG-ADMIN-DASHBOARD.md`), built exactly against the scope
below, including the "at risk" / "releases approaching" / "access issues" signals named here.
Scope this section originally set out — what it must eventually answer:

- How many active initiatives? How many active users?
- Which initiatives are at risk?
- Which releases are approaching?
- Which teams are overloaded?
- Are integrations healthy?
- Are there access/admin issues requiring attention (e.g. a team with no Owner-level access to its
  initiatives, a disabled user still shown as an initiative Owner)?

**Explicitly not the same thing as the management screens in this document.** The Admin Dashboard
is read-oriented, cross-organization reporting/intelligence (like the Standard Dashboard but
scoped to everything, not one user's work); Users/Teams/Access/Dashboard Configuration are
write-oriented management. Neither should absorb the other — a "quick-fix" widget on the Admin
Dashboard should link out to the real management screen, never try to reproduce it inline.

---

## 15. Cross-Navigation

No siloed screens. Every entity links to every related entity it has a real relationship with:

```
Users → Jane Smith → Product Team → Customer Portal → Access
```

Concretely: a User Detail's Teams section links to each Team Detail; a Team Detail's members link
back to each User Detail; both link into Initiative Access rows; each Initiative Access row's
grantee links back to the User or Team it names. This is a natural consequence of §16's "one
underlying permission system, three lenses" — the links aren't hand-maintained duplicate
navigation, they're just links to the one place each piece of data actually lives.

---

## 16. Three Entry Points — One Permission System

**Implemented at Step 8C, verified live**: a grant added from Team Detail's Initiative Access panel
appeared immediately when viewing the same initiative from `/admin/access/[id]`, and vice versa —
confirming this section's requirement held, not just that it was designed to.

User-centric (§4), Team-centric (§7/§9), and Resource-centric (§9) access views **all read and
write the identical underlying `TeamMember` and `InitiativeAccess` rows** —
`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §15 already mandated this ("all three should modify the same
underlying permission records... never three separate permission systems"). This phase doesn't
revisit that decision, only confirms every screen proposed above complies with it: none of Users,
Teams, or Access maintain their own copy of "who can access what" — each queries the same two
tables from a different starting point.

---

## 17. Reversibility UX

| Action | Reversible via | Confirmation needed? |
|---|---|---|
| Add user to team | Remove | No — low-stakes, additive |
| Remove user from team | Re-add | **Yes, with impact preview (§8)** — the only "removal" step that needs one, because it can silently change access |
| Upgrade View → Edit | Downgrade | No |
| Downgrade Edit → View | Upgrade | No — but show impact if it's the user's only source of write access |
| Revoke direct access | Re-grant (loses no data — re-adds a fresh row) | **Yes, with impact preview (§10)** |
| Restore direct access | — | No |
| Disable user | Re-enable | Yes, plain — impact is well-understood (§5), no diff table needed |
| Re-enable user | — | No |

**Principle:** confirmation dialogs are reserved for actions whose *consequence isn't obvious from
the action's label alone* (removing someone from a team doesn't obviously say "and this changes
their access to X") — not for every mutation. Purely additive actions (add to team, upgrade,
restore) never need a confirmation; they can only expand access, and expanding access by mistake
is trivially fixed by revoking again.

---

## 18. Feedback / Confirmation Patterns

Simple toast-style confirmations, not modals, for completed actions:

> Access granted · Access changed to View · Removed from Engineering · User disabled ·
> User re-enabled · Team created · Team deleted · Dashboard configuration saved · Owner reassigned

Not implemented this phase — defining the expected copy now so Step 8B–8E don't invent
inconsistent language per screen.

---

## 19. Audit Placement

Minimum for MVP: **event capture only**, per `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §16's event list
— no dedicated audit UI yet. Placement, once it exists, in priority order:

1. **Initiative Access detail** (§9) — highest value first: "who granted/changed access to this
   initiative, and when" is the question an admin asks most often when something looks wrong. A
   short "recent changes" list here is a cheap Step 8C byproduct (query `AuditLog` filtered to one
   initiative), not a separate build effort.
2. **User detail / Team detail** (§4/§7) — the same events, filtered to one person or team.
3. **Organization-wide Activity page** (already a disabled nav stub under ORGANIZATION,
   `docs/V2-APPLICATION-SHELL-BLUEPRINT.md` §9) — a full, searchable feed. This is the most
   expensive of the three (needs its own filtering/search UX) and is Phase 2.

---

## 20. Edge Cases / Safeguards

| Case | Safeguard |
|---|---|
| Removing the last Organization Admin | **Blocked.** "This is the only Organization Admin — promote another user first." |
| Admin disabling themselves | **Blocked outright.** No defined recovery path exists yet if the only admin locks themselves out. |
| Deleting a team that still grants resource access | Impact preview required (mirrors §8): "This team grants access to N initiatives for M members — deleting it removes that access." Confirm to proceed. |
| Deleting a team with members | Same preview; members simply lose team-derived access per the standard revocation rule — no separate mechanism needed. |
| Removing an initiative's Owner | **Implemented at Step 8C, simplified**: blocked outright (409, "grant Owner to someone else first") rather than the atomic "Reassign Owner to…" combined action originally proposed — same shape as the last-active-org-admin safeguard. Lower stakes than that one: an Organization Admin always has implicit Owner-equivalent access regardless of this grant, so this only protects the *stored* grant, never actual access to the initiative. Verified live (`docs/V2-RESOURCE-ACCESS.md` §19). |
| External user accidentally set to Edit | **Prevented by construction** — the permission picker never renders Edit/Owner for an External grantee. Nothing to catch after the fact. |
| User has access through multiple teams | Not an error — expected and handled by highest-wins (§10 shows all contributing sources). |
| Duplicate direct grant on the same initiative | **Prevented by construction** — `InitiativeAccess` is unique per (initiative, grantee); "Add Access" detects an existing grant and offers "Change" instead of creating a second row. |
| Disabled user still listed on a team | **Allowed, deliberately** (§5's Option A) — shown de-emphasized/greyed with a "Disabled" badge in the roster rather than hidden, so the admin isn't confused about why a visible member can't act. |

---

## 21. Screen Inventory

| Screen | Purpose | Key information | Primary action | Links to |
|---|---|---|---|---|
| **Users List** | Org-wide people directory | Name, email, role, access level, member type, team(s), status | Invite User | User Detail |
| **User Detail** | One person's full profile + access | Profile, authority, working role, member type, teams, resource access with source | Disable / Enable / Change Access Level | Team Detail, Initiative Access |
| **Teams & Stakeholders (list)** | Team directory, admin-aware | Team name, member count, initiative count | Create Team | Team Detail |
| **Team Detail** | One team's roster + access | Members, initiative access, composition | Add/Remove Member, Add/Change/Revoke Access | User Detail, Initiative Access |
| **Access** (org-wide picker) | Entry point to "who can access this initiative" | Initiative list | Select an initiative | Initiative Access |
| **Initiative Access** | Full grant list for one initiative | Teams + individuals with level and source | Add Access / Change / Revoke | User Detail, Team Detail |
| **Dashboard Configuration** | Per-role widget visibility | Widget list per Working Role, visible/hidden | Toggle widget, Reset to Default | — |
| **Organization** | Org identity + admin roster | Name, size, industry, status, admin list | Edit org details, promote/demote admin | Users |
| **Settings** | Planning/operational defaults | Methodology default, sprint defaults, notification/integration/security defaults | Edit defaults | — |

External Users are **not** a separate screen — they're a filtered view of Users List / a variant of
the invite flow (§11), consistent with "no separate admin product."

---

## 22. MVP / Phase 2 / Enterprise Later

**Step 8 MVP** (needed for a functional prototype at 10–50 users):
- Users List + User Detail, with Disable/Re-enable and Access Level/Member Type edit
- Archive (soft-delete) for internal users; Remove for external users — no hard delete
- Teams & Stakeholders admin-aware (create/rename/add/remove members)
- Resource Access: Grant/Change/Revoke from all three entry points (User/Team/Initiative), sharing
  one resolution function
- Permission Source display ("via Team" / "Direct" / combined) everywhere access is shown
- Plain-text impact preview before team-removal and access-revocation
- External user invite workflow (design only this phase; built in 8B/8C) with View locked, no
  Edit/Owner option ever rendered
- Dashboard Configuration: visibility-only, per Working Role, with Reset to Default
- Safeguards from §20 (last-admin block, self-disable block, owner-reassignment requirement,
  structural External/duplicate-grant prevention)
- Audit event **capture** (schema + write path), no dedicated audit UI

**Phase 2** (useful, not required initially):
- Rich visual before/after diff tables for team-removal/revocation impact (vs. MVP's plain text)
- Bulk operations for genuinely multi-select actions (e.g. disabling several departed users at
  once) — most "bulk" need is already absorbed by team-based grants (§ below), so this is narrower
  than a typical bulk-admin feature set
- Dashboard Configuration ordering (not just visibility), and team-level configuration
- Admin override of a user's self-selected Working Role
- Surfaced audit history on User/Team/Initiative Access detail screens
- Organization-wide Activity page (full searchable feed)

**Enterprise Later** (intentionally not built):
- Bulk-add-N-users-to-a-team / bulk-grant-across-many-initiatives tooling — note that team-based
  grants already deliver most of the value a "bulk grant" feature would (grant the team once, every
  member inherits it), so this need is smaller than it first appears at this org size
- Hard delete / permanent purge of a user and their history
- Individual-level dashboard configuration overrides
- Any RBAC matrix, custom role definitions, or field-level permission flags beyond Owner/Edit/View
- SSO/SCIM-driven user or team provisioning

---

## Step 8B–8E Implementation Sequence

The prompt's proposed order (8B Users+Teams → 8C Resource Access → 8D Org Admin Dashboard → 8E
Dashboard Configuration) was evaluated against actual data dependencies and **holds** — it is
already the safe order, not just a reasonable one:

- **8C depends on 8B**: `InitiativeAccess` grants target a `User` or a `Team`, so both must exist
  first.
- **8D benefits from 8C**: an Org Admin Dashboard that reports "access/admin issues requiring
  attention" or "overloaded teams" (§14) needs real Users/Teams/Access data to report on — building
  it before 8C would force the same kind of placeholder gap Step 7B hit with Capacity/Cost.
- **8E depends on 8D** (partially): Dashboard Configuration needs a Working-Role dashboard to
  configure — the Standard Dashboard already exists (Step 7B), but if Org Admin Dashboard also
  gets its own configurable widgets later, 8E can't precede 8D for that half of its scope.

**One refinement worth calling out explicitly:** within 8C, build the shared resolution function
(`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §21 step 4 — "one server-side authorization module... not
duplicated per route") **before** any of the three access UIs (User/Team/Initiative entry points).
Otherwise there's a real risk one screen gets built against ad hoc logic first and the other two
have to be retrofitted onto the shared module later — exactly the kind of drift §16 says must not
happen.

**Confirmed correct in practice at Step 8C**: `src/lib/access/resolution.ts` was built first, the
DB-facing wrapper and mutation layer second, and all three UI entry points (User Detail, Team
Detail, `/admin/access`) were built against that one already-existing module — never the ad hoc
order this refinement warned against. See `docs/V2-RESOURCE-ACCESS.md` for the full result.

8C complete. 8D (Org Admin Dashboard, `docs/V2-ORG-ADMIN-DASHBOARD.md`) complete. 8E (Dashboard
Configuration, `docs/V2-DASHBOARD-CONFIGURATION.md`) complete.
