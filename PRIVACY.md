# Privacy Policy & Zero-Trust Local-First Data Architecture (`LFS Block Studio`)

**Effective Date**: November 1, 2026  
**Project**: LFS Block Studio (`OASIS-BLKS` / `lfs-voxel-sandbox`)

## 1. Local-First By Default (`100%` Offline Capable)
- All authored voxel worlds, custom block definitions, structure blueprints, portable resource kits (`.zip`), Undo/Redo history, and Crucible diagnostic logs are stored **locally on your device** in browser IndexedDB (`brickforge_studio_idb_v2`) and localStorage.
- Core building, schematic export (`.candidate.schem`, `.gltf`, `.tscn`, `.gd`, `.ldr`, `.mcfunction`), and 6-suite Crucible self-testing operate **without network access or cloud credentials**.

## 2. Optional Cloud & Sovereign Forge Features
- **Local Sovereign Forge (`127.0.0.1:19447`)**: When running inside the LFS Oasis Suite on Linux (`U3`), visual bug analysis requests (`/api/ai/analyze-issue`) route first to your loopback Sovereign Forge daemon (`http://127.0.0.1:19447/v1/healer/analyze-issue`) so diagnostic telemetry stays on your machine.
- **Optional Cloud Co-Op & Google Drive Backup**: Firebase Firestore snapshots and Google Drive `.lfsproj.json` backups are strictly opt-in and only transmit data when you explicitly sign in and trigger a cloud save or backup.
- **Zero-Trust Secret Vaulting**: No hardcoded API keys are shipped in repository config files (`firebase-applet-config.json` uses `"VAULT_INJECTED_AT_RUNTIME"`).

## 3. Data Retention & User Control
- You can export complete portable `.lfsproj.json` backups or `.zip` resource kits at any time from the Studio Workspace Menu or Recovery Panel.
