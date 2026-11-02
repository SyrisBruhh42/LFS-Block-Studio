# Oasis menu, scene browser and window progress

Recorded 2026-11-01. **P4 partial; full G4 and P0–P8 remain incomplete.** At that checkpoint, the frozen assets were `index-C70OtLN2.js` / `index-D2Asi-nd.css`, based on unchanged HEAD f2de5949594202e57fda9dc38cea7bf3634825ab plus captured uncommitted changes. No new application dependency was installed.

## User-visible behavior

The brand button and Find actions open a native modal workspace menu. Search filters 23 actions; Enter in the search field focuses a result, and a subsequent activation opens the existing operation or its controls. Typing/highlighting does not run a build command. Native focus ownership pauses underlying input; closing returns to the opener. Existing panels remain available during incremental migration.

Scene & inspect searches block names, definition/instance IDs and coordinates, with 25 rows per page. Inspecting is read-only. One cell inspector shows position, definition, rotation, geometry and scale. Select this cell changes both selection corners through one session transaction; actual Undo/Redo restores the selection. A subsequent region edit affects that exact cell. Use this block chooses a brush and rejects ineligible locked definitions with a visible reason. Scene filtering is computed only while that page is open. This is bounded pagination, not a measured capacity claim or a grouping/virtualization implementation.

Project details provides a local name, applied once through the shared authored session. A changed source invalidates a dirty rename draft until the user reloads the current name; a rename is undoable. No multiplayer panel or account is needed.

Menu comfort uses actual captured Oasis tokens/icons with original notices and individual hashes in `src/resources/oasis/integration_manifest.json`. Evergreen dark, evergreen light, high contrast and calm are available. Text (100–200%), control minimum (36/48/56px), menu width and reduced motion are independent versioned browser preferences. Coarse-pointer CSS keeps a 48px minimum. The new preferences currently affect this menu; older panels retain their own settings. They do not recolor authored scene materials or enter project/history. Unsupported future/malformed settings are preserved; denied writes report session-only operation. Cross-tab preference synchronization is not implemented.

Shared windows gained magnetic panel/HUD snapping, guides, primary-pointer ownership, cancellation/blur handling, numeric position/size controls and actual centering. HUD actions no longer start a drag. Native dialog identity is retained for modeless windows without declaring them modal. These changes do not establish focus containment/accessibility for every legacy window.

Clear selection is visible under Coordinate tools and available through `//desel`, `//deselect`, `//sel`. It clears only selection, preserves build/clipboard, and shares session Undo/Redo. Region commands still reject an absent region. Incoming default-region invention was deliberately not adopted.

Remaining toolbox/HUD/project-menu CC0/provider assertions were corrected: local procedural presets have unverified external provenance. Saved provider-like IDs remain stable; they do not establish origin or rights.

## Evidence and limits

- **Menu App 9 on C70OtLN2:** actual keyboard focus/search and existing review handoff; 60-cell page discovery and exact target edit; complete authored equality and real selection Undo/Redo; independent settings and retained pending Redo; selected text/control-boundary contrast pairs across four themes; 200% text/320 CSS-pixel reflow; preference/project-name reload; future/denied storage; 30 emulated coarse-pointer controls meeting 48px targets. Screenshots were inspected. This is not whole-application zoom/accessibility qualification.
- **Java App 10 and navigation App 9 on C70OtLN2:** actual schematic downloads independently decoded, report hash, source/storage/history/reload, numeric export-window layout and clear-selection restoration; 20 visible camera movements with exact Previous-image restoration. Native Minecraft/WorldEdit remains NOT_RUN — skipped by user.
- **Mounted windows9 and export UI 13:** stable scoped hashes, no recorded page errors. Export producer completions are controlled fixtures, separately scoped from full-App download tests.
- **267 contracts  / 24 files:** named domain tests pass. Later menu/provenance changes do not modify these domain modules. TypeScript/build pass; existing Vite configuration and large-bundle warnings remain. No performance claim follows.

Failures remain evidence. Window checks found real delayed disclosure draft overwrite, false Center behavior and loss of export-dialog semantics; production fixes were checked. Other failed checks were faulty observers: delayed camera state after deferred menu activation; assuming Frame selection's existing toolbar button disables when no region exists; automation option helpers disagreeing with native disabled-option behavior. The corrected selection oracle uses actual edits/history and native keyboard selection rather than weakening the domain outcome.

## Remaining work and stop conditions

Complete semantic source convergence, all-route G2 and P1 lifecycle work. Continue the Oasis shell beyond this menu: consolidate the ribbon/panels/resource drawer, contextual editable inspector, independent selection outlines/render controls, qualified navigation presets and complete keyboard/screen-reader/physical-device tasks. Selection transform/nudge/repair/conversion copies, resource closure/recipes, faithful geometry export, measured scale and offline/update/rollback remain in P5–P8.

Any unexpected authored change from appearance/navigation, lost Redo, stale rename/selection application, lock bypass, partial cell edit or original preference overwrite reopens this slice. Native skip limits dependent claims and does not stop independent implementation. No commit, push, merge, provider operation, hosting or deployment was performed.

Continuation: the historical capacity follow-up was Ca-k58z3. IMPLEMENTATION_STATUS.md and BRUSH_MIRROR_CONTRACT.md identify the latest Dn brush/input work and actual rerun menu workflows. Counts/screenshots above remain the original C70 slice.

Contextual properties continuation: CELL_INSPECTOR_CONTRACT.md and IMPLEMENTATION_STATUS.md identify the latest source. The menu now has24 actions, and scene discovery hands off to one modeless editable properties dock. A single App preferences hook supplies shared menu/properties appearance. The original counts/candidate above remain historical; broader shell/accessibility migration remains open.

Recipe continuation: the menu now exposes25 actions and shares appearance/width preferences with the native Recipe workspace; contextual properties retains its independent width. Existing HUD macros open review instead of immediate Apply. See RECIPE_WORKSPACE_CONTRACT.md and the current status/ledger; original menu/window evidence above stays historical.

Resource-kit continuation: RESOURCE_KIT_CONTRACT.md and evidence/20261101-resource-kits identify current source and 18 added resource journeys. Import/placement/packaging reuse the same session/preferences; menu now has 26 actions and appearance reaches menu, properties, recipes and resources. Earlier App lanes actually reran. Original receipts above retain their historical scope; complete phases and release remain unaccepted.
