# Clarivia redesign implementation status

Source: architecture release `58ed139` (`origin/master`). The older dirty checkout was not changed. This branch contains the first implementation pass against the desktop and mobile references in `D:/TLO project -product-/output/clarivia-ui-implementation-reference-2026-11-08`.

## Visual acceptance

The required 95/100 score is **not yet verified on authenticated production data**. The product owner chose to review the changes with the existing production account rather than create staging accounts. A local, isolated fixture was used to measure and screenshot the home layout without writing production data. Do not call the full redesign visually complete until each actual route is reviewed.

| Screen | Implementation in this branch | Desktop score | Mobile score | Screenshot pair |
|---|---|---|---|---|
| Overall dashboard | Home composition rebuilt against the attached product-overview image; real counts and honest unavailable states | Fixture placement measured; actual account pending | Responsive fixture reviewed; actual account pending | `D:/TLO project -product-/output/clarivia-home-fidelity/home-desktop-preview.jpg` and `home-mobile-preview.jpg` |
| Projects | Dense list, detail drawer, mobile cards/sheet | Unmeasured | Unmeasured | Pending staging |
| Initiatives | Lifecycle, focus, goal/evidence rail, retained five-tool guide | Unmeasured | Unmeasured | Pending staging |
| Sprint planning | Candidate list/detail, readiness checks, capacity/action band, mobile detail sheet | Unmeasured | Unmeasured | Pending staging |
| Demo scheduling | Agenda tabs, outcome view, planned Meet/Zoom panel, mobile agenda sheet | Unmeasured | Unmeasured | Pending staging |
| Demo attendance | Honest future preview, unavailable metrics, real recorded outcomes only | Unmeasured | Unmeasured | Pending staging |
| Sprint review | Four record-derived metrics, draft/final status, existing narrative/evidence/finalization | Unmeasured | Unmeasured | Pending staging |
| PO validation | Candidate/story/criteria columns, explicit Return/Accept/Reject, failing-criterion guard | Unmeasured | Unmeasured | Pending staging |
| Release readiness | Five gate summaries, visible blockers, exact approval authority, existing audit flow | Unmeasured | Unmeasured | Pending staging |
| Shared top bar | White reference-style header on Home; existing navy header and navigation controls retained elsewhere | Home fixture reviewed; other routes pending | Home fixture reviewed; other routes pending | Home screenshot pair above |

## Verification completed

- Typecheck and lint pass.
- Production build passes with `next build --webpack` outside the restricted Windows sandbox.
- Full Vitest suite passes: 151 files, 1,018 tests. Vitest needs a writable `TEMP`/`TMP` under the checkout in this environment.
- Development-only meeting and attendance preview panels pass horizontal-overflow checks at 320, 390, 440, 768, 1280, and 1920 pixels.
- Browser clicks on Google Meet, Zoom, Test connection, Create meeting link, Send invitations, Refresh, and Match person show the exact message `Test will be incorporated soon.` and make no app API or provider request.
- Home fixture placement at 1672 × 940: sidebar 238px, title y=99px, KPI row y=165px, main panels y=291px, activity y=754px. The attached reference, scaled to that viewport, places these at approximately 237px, 99px, 162px, 289px, and 758px. Mobile and intermediate widths had no document-level horizontal overflow.

## Remaining acceptance work

1. Review the published Home screen with the existing production account and compare its real-data layout with the local screenshot pair.
2. Capture the remaining implementation screens at 1672 × 940 and 390 × 844; use full-page mobile captures where the reference scrolls. Include empty, populated, draft, finalized, blocker, and long-name states.
3. Compare each pair against its reference using the weighted rubric: placement 35, size/spacing 25, typography 15, color/borders 15, details 10. Record a score separately for desktop and mobile. Any score below 95 remains incomplete.
4. Exercise the authenticated project → initiative → sprint plan → demo → review → validation → release flow with editor, owner/admin, viewer, and external stakeholder accounts. Confirm hidden/disabled actions, audit history, and unsaved-change protection.
5. Inspect the intermediate widths on each real route for overflow, overlap, sticky-band obstruction, and keyboard access; adjust any failed screen and recapture it.
