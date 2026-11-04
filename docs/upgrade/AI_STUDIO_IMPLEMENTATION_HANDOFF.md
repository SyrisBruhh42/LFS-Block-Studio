# AI Studio handoff — end-to-end upgrades

Read `end_to_end_delivery_plan.md`, `system_snapshot.md`, `CURRENT_STATUS.md` and `UPSTREAM_RECONCILIATION.md`. If implementing, use the matching CURRENT_SOURCE.zip/manifest and actual Oasis resources/notices. If ZIP attachments are unsupported, extract the relevant files. Attachment limits were not tested; local paths are not remotely accessible dependencies.

## Product and confirmed decisions

Build a joyful, precise browser-first local studio with a calm Oasis UI and optional resource/command/recipe depth. The main toggle is **Game compatibility lock**. First target: **Minecraft Java Edition / WorldEdit .schem**. Theme, density, layout, navigation preset and permissions are separate. The complete scope is P0–P8 in the delivery plan.

## First work order: preserve and converge (`CONVERGED_AND_VERIFIED`)

Full semantic convergence of `codex/studio-upgrades` (base `f2de5949594202e57fda9dc38cea7bf3634825ab`) and GitHub `main` (`2392861a75db96a659d564f59ada9da8922b6fe6`) is complete and verified (`CONVERGED_AND_VERIFIED`). Both source trees and pre-convergence states are preserved in `$HOME/.local/share/lfs-oasis/adopted-projects/backups/lfs-block-studio-pre-convergence-20261101.tar.zst`.

## Existing work to reuse

- StudioEditorSession is the mounted authored/history authority. Camera/preferences are separate. Complete transactions validate before publication; effects follow accepted commit. Do not mount studioActions.ts as another authority.
- Complete schema/store/hydration, exact-original import archival, typed target/checkpoint/epoch transitions and explicit compatibility review exist. Mapping/version or incompatible conversion requires a reviewed separate copy; generic conversion is not implemented.
- Strict Java mapping/encoder and source-bound binary review/download/report are mounted. Locked Java cannot use legacy heuristic/AI mapping. Current Java App 10 independently checks actual gzip/NBT downloads, report hash, numeric layout, selection restoration, real Undo/Redo and save/reload. Scoped export UI 13 retains async guards.
- Current converged candidate passes 135 actual App cases (resource18 plus 117 rerun workflows), **402 domain tests / 32 files** (including the 6-suite Crucible self-test fuzzer `selfTestSuite.test.ts` with 24/24 assertions), and `tsc --noEmit` + `vite build`. All 107 persistence/recovery harness cases also pass on stable source. Historical receipts retain their own identities; native Minecraft/WorldEdit tests remain `NOT_RUN (skipped by user)`.
- Preserve `prepareStudioBrush` as a detached proposal under the existing session: stable IDs/no-op/Redo/effects, unique changed cells, exact pivots/negative layers, full cell/chunk Undo, rendered source fences and project-scoped gesture cancellation. Numeric brush/mirror controls share session-only preferences with the HUD and preserve stale drafts. The exact locked Java candidate reflects directionless mapped cells at rotation 0; Freeform anchor/facing is not arbitrary geometry reflection. See BRUSH_MIRROR_CONTRACT.md.
- Preserve reversible changed-data history, compact project JSON backups and conditional versioned candidate UTF-8 encoding. Small edits in 20 MiB documents and an actual near 32 MiB downloaded/reopened copy pass; changed-data edits above the 16 MiB retained allowance still reject atomically. Strict original-source/readback/final CAS and exact bytes/damaged-text envelopes prevent silent rescue loss. See HISTORY_CAPACITY_CONTRACT.md. These are Chromium correctness fixtures, not hardware capacity or universal quota/rollback acceptance.

- Reuse StudioRecipeModel/reviewStudioRecipe and the native Recipe workspace for every macro entry. Every detached step uses complete document/workspace/policy validation. Keep exact @id active substitution, true no-op/Redo, fresh new-placement IDs, moved IDs, review/job/draft/source/close/duplicate fences and one cell/library/workspace/chunk commit. The workspace validator is the existing session implementation; createStudioId moved to studioId.ts with its old export retained. Studio @id syntax is local, and the report is not a native script or full project backup. See RECIPE_WORKSPACE_CONTRACT.md.

## Delivery queue

1. Recheck current upstream/AI Studio source and finish semantic convergence and baseline/device work; retain failures and recovery points.
2. Continue remaining async/cached/effect routes and whole-stroke G2 coverage, preserving the implemented brush path; retention/checkpoint pins, wider load/history/encoded-record/rollback qualification, named-copy discovery, unknown-policy/pagination App scenarios and quota/two-tab/update recovery.
3. P4: preserve menu/search, scene discovery and the modeless contextual properties path. studioCellEdit prepares exact source-bound patches; StudioCellInspectorModel owns draft/view lifecycle only; the existing session commits/Undo. Keep stable IDs, occupied-anchor rejection, fractional positions with integer selection anchors, explicit scale source, appearance preservation and stale/close/duplicate fences. One App preferences hook serves menu/properties. Continue shell/resource-drawer consolidation, studio-wide controls and qualified presets/accessibility/first use; see CELL_INSPECTOR_CONTRACT.md.
4. Continue a useful Java candidate palette and structural/App evidence. Native paste/save-reload/export-back remain skipped by user and unqualified. Do not request the environment again or install/run the game. Keep experimental labels; continue independent Freeform/UI work.
5. P5 precision/slices/snap/repair/conversion copies; P6 general asset intake/linked prefabs, richer recipe diagnostics/completion and fully qualified offline journeys; P7 measured capacity/faithful GLB; P8 offline cold-start/update/rollback/support/handoff.

The first integrated release is starter → controls/target → build → inspect/correct/Undo → save/reopen → review/export → native paste. All advertised-scope critical gates must pass. No calendar estimate without actual capacity and accepted-slice throughput.

New code dependencies must solve an observed problem and pass exact MIT/Unlicense artifact/transitive admission; do not install the shortlist wholesale. Preserve Oasis ownership/notices; reuse themes/icons without importing its server/identity architecture. Core editing/backup remains useful without credentials. AI/cloud is optional and needs explicit data controls, bounded jobs/cost and conflict behavior.

For each slice return changed behavior/files, source/dependency identity, acceptance checks and failed/unrun results, a recovery point, known limits and the next bounded package. Distinguish source, tests, browser/device/native, merge and deployment. This reference is context and a plan; it does not grant authority to publish, send content to providers, install native tools or overwrite newer work.

User decision recorded 2026-11-01: skip native Minecraft/WorldEdit runs. Do not request the environment again or install/accept terms. Continue independent work; retain native NOT_RUN and experimental export claims. See NATIVE_TEST_DECISION.md.

The current local resource-kit slice did not refresh GitHub main. Recheck its last observed2392861 ref before convergence; no source merge has occurred. Native game runs remain skipped, not a prerequisite to independent local work.

Resource continuation: reuse StudioKitModel, the native resource workspace, studioKit/studioKitZip and prepareStudioPrefabPlacement. Read RESOURCE_KIT_CONTRACT.md before changing format/lifecycle. The existing candidate path preserves exact ZIP originals, then one source-bound session transaction adds library and non-authoritative notices. Selective export includes complete definition closure/source notices. Reviewed placement commits exact cells/chunks once; unused Freeform resources cannot bypass the Java lock. The original six-material/three-blueprint Courtyard kit has its own MIT notice; it does not relicense the App or Oasis.

Keep four-surface appearance, native modal/input ownership and draft/source/report/cancel/duplicate fences. Retain sharing text while requiring a resource-choice refresh on source change. Binary kits remain 4 MiB; exact base64 recovery envelopes have a separate 6 MiB intake. Future version/provenance/units/axes fail closed. Project backups retain data/notices; source candidates are additional recovery, not independent device-loss backup. Resource App18 uses actual downloads and an independent Python ZIP/CRC/JSON/hash reader. Offline evidence is in an already-loaded App with later loopback assets and blocked service workers; it is not PWA cold-start/update acceptance.
