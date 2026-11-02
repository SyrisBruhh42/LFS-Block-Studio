# LFS Block Studio (`OASIS-BLKS` / `lfs-voxel-sandbox`)

<!-- lfs-steward:human-zone:begin -->
**LFS Block Studio** is the flagship 3D voxel, modular brick, and architectural CAD workbench of the **LFS Oasis Suite (`v2.0.0 / CP-12 + v3.8-sovereign-forge`)**. It combines a calm Oasis Studio UI with a single authoritative project/history session (`StudioEditorSession`), reviewed **Minecraft Java Edition / WorldEdit `.schem` compatibility locking**, portable block-native resource kits (`.zip`), reviewed recipe macros, a 6-domain Crucible self-test fuzzer, and zero-trust integration with the **Local Sovereign Forge (`127.0.0.1:19447`)**.
<!-- lfs-steward:human-zone:end -->

<!-- lfs-steward:auto-zone:begin -->
## 1. Architecture & Core Capabilities

| Subsystem | Module / Entrypoint | Capabilities & Invariants |
|---|---|---|
| **Authoritative Session & History** | `src/lib/studioEditorSession.ts`, `src/lib/studioDocument.ts`, `src/lib/useStudioPersistence.ts` | Single authored/history authority (`30` entries / `16 MiB` delta budget, `32 MiB` JSON intake ceiling), staged readback + CAS persistence, and non-destructive candidate archival. |
| **Game Compatibility Lock & Sponge v3 `.schem`** | `src/components/StudioCompatibilityPanel.tsx`, `src/engine/javaSchematic.ts`, `src/engine/javaCellMapping.ts` | Explicit Java target policy (`schemaVersion: 2`), reviewed block-state mappings, checkpoint + history epoch transition, and binary Sponge v3 `.candidate.schem` encoder/decoder. |
| **Oasis Workspace Menu, Properties, Recipes & Kits** | `src/components/StudioWorkspaceMenu.tsx`, `src/components/StudioCellInspector.tsx`, `src/components/StudioRecipeWorkspace.tsx`, `src/components/StudioResourceWorkspace.tsx` | `28` searchable actions, modeless cell inspector, detached recipe preview & single-Undo commit, and STORE/DEFLATE `.zip` resource kit v1 import/export with SHA-256 + CRC-32 verification. |
| **3D Viewport, Spatial Copilot & Multi-Format Export** | `src/components/SkyblockViewport.tsx`, `src/engine/spatialCopilotEngine.ts`, `src/engine/godotExporter.ts` | Shared-stud geometry memory guard (`disposeUnsharedGroupGeometries`), steep-drop red pulse telemetry, placed-blocks-first raycasting, Godot 4 `.tscn`/`.gd`, and embedded glTF 2.0 unit-cube mesh + PBR material export. |
| **6-Suite Crucible Self-Tester & Sovereign Forge Healer** | `src/engine/selfTestSuite.ts`, `src/engine/issueTrackerEngine.ts`, `src/components/SelfTestingAuditorModal.tsx`, `server.ts` | `24` automated assertions across 6 domains (`402/402` total contract tests across `32` test files) + local issue routing to `http://127.0.0.1:19447/v1/healer/analyze-issue`. |
| **LFS Oasis Capsule Bridge (`OASIS-BLKS`)** | `src/lib/oasisCapsuleBridge.ts` | `Shift+Tab` Universal Chat Overlay forwarding, `OASIS-BLKS` room code prefix, Wisdom Sparks $\leftrightarrow$ Starlight Rupees milestone hooks, Universal Audioplay Bar state, and Dual Cloud Storage routing (`/01-Game-Saves/lfs-block-studio/` and `/04-Workbooks-And-Docs/`). |

## 2. Verification & Development Commands

```bash
# Install dependencies
npm install

# Run all 32 contract & Crucible test suites (402 tests)
npm test

# Run strict TypeScript verification
npm run lint

# Build offline-capable production bundle
npm run build
```

## 3. Zero-Trust Secret Vaulting (`ZT-1`)

No API keys are committed to `firebase-applet-config.json` (`"apiKey": "VAULT_INJECTED_AT_RUNTIME"`). At runtime, `server.ts` and `src/lib/firebase.ts` resolve credentials from `~/.config/lfs-oasis/secrets.env` (`LFS_FIREBASE_API_KEY`, `GEMINI_API_KEY`) or process environment variables, falling back cleanly to 100% offline local IndexedDB mode when unconfigured.
<!-- lfs-steward:auto-zone:end -->

<!-- lfs-cmi-lockdown:begin v1 -->
## 4. Copyright Management Information & TDM Reservation (`17 U.S.C. § 1202` & EU DSM Art. 4)

- `Copyright (c) 2026 SyrisBruhh42. All Rights Reserved.`
- `PROPRIETARY AGENT ARCHITECTURE & SKILL SPECIFICATION: Any unauthorized copying, commercial repackaging as a standalone agent skill, redistribution, or automated AI training/scraping is strictly prohibited without prior written license from the copyright holder.`
- `Removal or alteration of this Copyright Management Information (CMI) is a violation of 17 U.S.C. § 1202 (DMCA).`
- **Machine-Readable TDM Opt-Out**: `tdm-reservation: 1` enforced via `.well-known/tdmrep.json`, `.aiexclude`, and `.noai`.
<!-- lfs-cmi-lockdown:end -->
