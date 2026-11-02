# Source convergence status (`CONVERGED_AND_VERIFIED`)

Updated **2026-11-01**. Full semantic convergence between `codex/studio-upgrades` (`01a196df-f7da-7323-89dc-9f6441db71a5`, base `f2de5949594202e57fda9dc38cea7bf3634825ab`) and GitHub `main` (`2392861a75db96a659d564f59ada9da8922b6fe6`) is complete and verified across all **32 domain/contract test files (`402/402` tests passing, `0` failures)**, `tsc --noEmit`, and `vite build`.

## Identities & Recovery Archive

- **Pre-convergence archive**: `/home/joe/.local/share/lfs-oasis/adopted-projects/backups/lfs-block-studio-pre-convergence-20261101.tar.zst`
- **Converged branch**: `codex/studio-upgrades` merged cleanly into `main` (incorporating `2392861a75db96a659d564f59ada9da8922b6fe6`)
- **Single authored/history authority**: `StudioEditorSession` (`src/lib/studioEditorSession.ts`) + `StudioDocument` (`src/lib/studioDocument.ts`) + `useStudioPersistence` (`src/lib/useStudioPersistence.ts`)
- **Zero-Trust Secret Vaulting**: Hardcoded `AIzaSy*` API key scrubbed from `firebase-applet-config.json` (`"apiKey": "VAULT_INJECTED_AT_RUNTIME"`), resolved at runtime via `/api/lfs/vault/client-config` (`~/.config/lfs-oasis/secrets.env` or `VITE_FIREBASE_API_KEY`).
- **LFS Oasis Suite Capsule Bridge (`OASIS-BLKS` / `lfs-voxel-sandbox`)**: `src/lib/oasisCapsuleBridge.ts` + `server.ts` routing `/api/ai/analyze-issue` to Local Sovereign Forge (`http://127.0.0.1:19447/v1/healer/analyze-issue`) with offline heuristic fallback.

## Converged Path Matrix (`f2de594...2392861` + `codex/studio-upgrades`)

| Path | Upstream `2392861` role | Converged resolution (`CONVERGED_AND_VERIFIED`) |
|---|---|---|
| `src/engine/selfTestSuite.ts` & `src/engine/selfTestSuite.test.ts` | 6-domain automated Crucible fuzzer (`24` assertions, `7` node:test cases) | Ported and adapted to `codex/studio-upgrades`'s strict `exportSpongeSchematicJson` mapping validation (`computeInitialBlockMappings`). All 6 suites & 24 assertions pass (`7/7` node:test cases). |
| `src/engine/issueTrackerEngine.ts` & `src/components/SelfTestingAuditorModal.tsx` | Local diagnostic issue tracker, live DOM/ergonomics auditor, visual bug annotator | Ported and wired to `StudioRibbonHeader`, `StudioWorkspaceMenu` (`28` searchable actions), and `server.ts` Local Sovereign Forge (`:19447`) healer endpoint. |
| `src/engine/legoGeometry.ts` & `src/components/SkyblockViewport.tsx` | Shared stud geometry guard (`disposeUnsharedGroupGeometries`), GPU telemetry, `steepDropCoords` red pulse, placed-blocks-first raycasting | Converged into `SkyblockViewport.tsx` while retaining `StudioNavigationToolbar`, `MomentaryCameraView`, `ViewportGestureTracker`, `dispatchViewportDrop`, `ghostShortcutHint`, and `editScope`. |
| `src/engine/godotExporter.ts` & `src/components/SchematicExportModal.tsx` | Embedded glTF 2.0 base64 unit-cube mesh/PBR buffers + per-node `customScale`, Godot `.tscn`/`.gd` | Converged with `exportPreflight.ts` (`preflightLegacyExport` + `exportCommentName`) and `StudioJavaExportModal.tsx` so locked Java projects still enforce reviewed Sponge v3 `.candidate.schem` export. |
| `src/engine/worldEditEngine.ts` & `src/engine/chunkAndPatternEngine.ts` | Selection bounds clamp, `transformSelectionBox` validation, `resetSelection` | Converged with `allocatePlacementBlockId`, `validateBlueprintDefinitionMerge`, `prepareStudioBrush`, and `StudioRecipeModel` step admission. |
| `src/lib/firebase.ts`, `src/lib/googleDrive.ts` & `firebase-applet-config.json` | Cloud payload byte-budget guards (`450 KB` / `200 KB` / `750 KB`), scoped world IDs, Drive payload validation | Converged with `StudioDocument` preservation (`completeDocument`) and Zero-Trust Vault API key injection (`refreshVaultFirebaseClientConfig`). |
| `src/App.tsx` & `src/components/StudioRibbonHeader.tsx` | Self-Test & Circle Bug triggers, `Snap 16px` / `Free Drag` toggle, `computeUpdatedBuildStreak` | Converged on top of `StudioEditorSession`, `StudioWorkspaceMenu`, `StudioCellInspector`, `StudioRecipeWorkspace`, `StudioResourceWorkspace`, and `OasisCapsuleSDK`. |

## Qualification Boundaries Retained

- **Domain & Contract Tests**: `402/402` passing across `32` test files (`0` failures).
- **Native Minecraft / WorldEdit Qualification**: **NOT_RUN (skipped by user)** per `NATIVE_TEST_DECISION.md`. Binary `.candidate.schem` export is verified by independent gzip/NBT round-trip decoders in unit and browser tests, not by a live Minecraft Java installation.
- **glTF 2.0 Export Scope**: Exports embedded base64 unit-cube mesh geometry, PBR material factors, and per-node `customScale`; intricate brick studs and arch cutouts remain simplified to unit boxes in glTF drafts.
