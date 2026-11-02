# Exact brush cells, mirrors and shared editing

Implementation slice, 2026-11-01. The full P0–P8 roadmap, G2 and G4 remain incomplete. Native Minecraft/WorldEdit is **NOT_RUN — skipped by user**. This slice qualifies named local editing and input paths, not native game behavior.

## Observations and resulting behavior

The old volume brush generated a new instance ID whenever it revisited an occupied cell. A deterministic before-fix fixture reproduces an unchanged brush consuming history and replacing IDs. Brush feedback also used mirror centers rather than actual affected cells. A hard-coded lower floor skipped every destination below Y = −16 even though those coordinates are admitted by the project schema. Generic Z reflection produced rotation 180, which the current Java unit-cell validator rejects.

Placement, erasure and volume brushes now reuse `prepareStudioBrush` for detached proposals. The mounted `StudioEditorSession` remains the single complete authored/history authority; this module does not own state, saving, history or activation. The existing placement comparator was moved into a pure module and re-exported without changing its semantics. No new application dependency was installed.

## Rules and invariants

- Prepare from one current document/engine snapshot. Mixed source references reject. Rendered direct-edit handlers carry the session/document/epoch/edit-revision token; the session rejects an older callback before preparation, including edit→Undo ABA and reopened projects.
- Direct cell coordinates are integer addresses within the existing ±1,000,000 engine allowance. Active mirror pivots are whole or half cells, so reflection is exact. Other active-axis pivots reject; reflections are never rounded into an unexpected cell.
- Brush shape/config and every mirrored destination extent validate before applying the proposal. The combined visited-cell budget remains 100k; this ceiling is not supported interactive capacity. A later invalid mirror cannot publish earlier cells or feedback.
- Sphere/cube/cylinder/diamond, hollow/solid and empty-cell-only behavior remain bounded. Radius zero affects one cell per deduplicated mirror target. All admitted negative layers are included; the old Y = −16 clipping is removed. An out-of-bounds extent rejects as a whole.
- Existing instance IDs survive an unchanged placement or replacement at that cell. Exact content comparison includes appearance/scale fields. Repeated identical final content is a no-op and retains Redo, durable counters and success effects. A changed prediction or tool setting can still produce a real edit.
- Overlapping mirror centers count unique final changed cells, not visits. Existing Freeform ordering remains primary, X, Z, then XZ: later placement wins when rotations conflict; empty-only placement keeps a cell already filled. This is anchor/facing reflection, not a qualified geometric reflection of arbitrary custom shapes or microvoxels. Previewed geometric mirror/transform work remains P5.
- The exact locked Java candidate has only admitted full, directionless block states. It reflects integer cell addresses while keeping canonical rotation zero and the explicitly mapped native state. This operation rule does not admit a rotated source, change mappings/policy, permit instance overrides or extend to future directional/multipart profiles. Freeform retains its reflected facing rotations. Complete target validation still runs before commit.
- Placing changed cells reveals their chunks using the existing centered chunk coordinate contract. Erasure retains chunk visibility settings. Cells, definitions, selections/workspace, policy and chunk changes commit/Undo/Redo through the same session; all unrelated authored fields survive.
- Mounted brush proposals omit legacy engine snapshots; standalone legacy engine callers retain their default history behavior. The session alone retains complete reversible changes. Usage and removal learning run only after an accepted edit, using actual changed/removal coordinates. Counts do not establish gameplay or AI correctness.
- A final schema, policy or history-budget failure leaves document, workspace, tokens, history and success effects unchanged. A visible rejection notice may change. Save acknowledgements remain separate from live edit revision.

## Product surfaces and input

Coordinate tools now exposes **Place with volume brush** and **Erase with volume brush**, using the same handlers as the canvas. **Brush and mirror settings** offers native keyboard/form alternatives for shape, radius 0–8, cylinder height 1–12, hollow/empty-only, mirror mode and exact pivots. These are session tool preferences, separate from authored content, Undo, game compatibility and menu themes. They reset with the existing session preference behavior on reload; no new persistence guarantee is claimed.

Changing a second live control while the settings form is dirty preserves the draft and disables Apply until the user reloads current tool settings. Preferences alone never create an authored edit or clear Redo. The existing HUD and the form read the same preferences. One click/coordinate brush application is one history step. Continuous pen strokes remain successive stamps; whole-stroke grouping and physical pressure/eraser/palm behavior remain unqualified.

The viewport associates an unfinished gesture with its project/session/policy epoch. A replacement or policy switch cancels it; a late release cannot edit the new project. Ordinary edits within a continuous stroke do not rotate that gesture scope. Browser mouse and combined actual project-switch behavior are checked; this does not individually qualify every input guard, pointer-lock or hardware path.

## Evidence and falsification

Final source candidate and lane counts are in IMPLEMENTATION_STATUS.md and evidence/20261101-brush-mirror/SCOPE_LEDGER.json. The domain suite passes292 tests across 26 files. The new proposal fixtures include complete state/chunk Undo/Redo, overlap/IDs/no-op/Redo, actual removal coordinates, exact negative layers, half-cell rejection, locked mappings/transforms, late-mirror failure, stale tokens, mixed-source rejection and final history-capacity rollback.

The new full-App brush lane exercises13 named journeys: source-neutral settings, 108-cell mirrors and one Undo, no-op content/IDs/effects/Redo, complete erasure, 75-cell overlap and empty-only, final extent rejection, negative layers, stale settings, half/quarter pivots, an actual browser mouse click, down→actual project restore→late up, locked Java mirrors and complete save/reload. The visible XYZ readout is the pointer task's target; it is not an independent geometry/renderer reference. Actual downloads and complete authored content are compared.

The first helper fixture incorrectly assumed chunks used an uncentered origin; the existing contract centers chunk0 on [−8,+7], so the expected negative keys were corrected. A test watch entry initially omitted required fields. These fixture failures and the production ID-churn reproduction remain preserved. Initial C6 and later candidate receipts keep their own identities; do not promote them to a different bundle automatically.

The leading design reuses bounded engine functions, native controls and the existing session. A separate mutable builder store, a third undo model or a new dependency adds coordination cost without a demonstrated benefit. Reconsider when measured latency/allocation or faithful geometry cannot meet the actual workload after bounded fixes, or the intended operation needs a reviewed preview/copy rather than direct application.

Stop dependent acceptance on an unexplained cell/state/rotation/original difference, lost Redo, history/feedback on a no-op/rejection, partial mirrored publication, stale overwrite, policy bypass or incorrect downloaded content. Keep the predecessor and original project. Native, whole-app accessibility/physical devices, measured capacity, providers, all-route G2, semantic upstream convergence and release remain separate holds.
