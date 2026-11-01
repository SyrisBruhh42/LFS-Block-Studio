# LFS Block Studio — Live App Store Release, Engagement & Studio Polish Plan

Transform **LFS Block Studio** into a 100% App Store–ready, high-engagement 3D voxel creation game and architectural studio with boundless local storage, offline PWA installability, tactile WebAudio/haptic juice, dynamic atmospheres, and structured progression loops.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> All core product, sensory, and technical scope decisions have been confirmed from your selections:

- **Confirmed Decision 1 (Engagement & Replayability Suite)**: Implement all four engagement pillars:
  1. **Architectural Contracts & Mastery Ranks** (structured build objectives evaluated live against placed blocks, dimensions, materials, and symmetry to award XP and unlock Mastery Ranks from *Apprentice Mason* to *Grand Voxel Architect*).
  2. **Interactive Onboarding Tour & Daily Build Prompts** (guided 4-step interactive spotlight for first-time builders plus rotating daily creative challenges with streak tracking).
  3. **Procedural Starter Island Biome & Terrain Templates** (1-click generation for Floating Skyblock, Terraced Zen Garden, Desert Mesa Citadel, Volcanic Caldera, Alpine Snow Peak, and Cyber-Grid Studio Plate).
  4. **Cinematic Photo Mode & Build Timelapse Replay** (interactive timeline scrubber that replays every block placement in chronological order at $1\times$–$20\times$ speed, paired with aspect-ratio framing guides, depth/lighting presets, and clean PNG postcard export).
- **Confirmed Decision 2 (Sensory, Visual & Tactile Polish)**: Implement all four studio polish systems:
  1. **Synthesized Spatial WebAudio & Mobile Haptics** (zero-dependency procedural Web Audio synthesizer tailored to block material acoustic profiles—stone thuds, timber clicks, glass chimes, metallic rings, and chordal completion arpeggios—plus `navigator.vibrate` tactile pulses).
  2. **Dynamic Time-of-Day Lighting & Atmosphere Presets** (smoothly interpolated sun azimuth, warm/cool hemisphere fill, horizon fog, and procedural sky dome across *Dawn Mist*, *Studio Noon*, *Golden Hour*, *Starlight Midnight*, and *Overcast Blueprint*).
  3. **Spring-Physics Block Placement & Break Particle Bursts** (second-order spring scale-in settle on newly placed blocks and color-matched voxel debris bursts on removal).
  4. **Multi-Touch Pinch-to-Zoom & Two-Finger Pan Gestures** (dedicated dual-pointer pinch zoom and two-finger camera pan on touchscreens alongside single-finger/stylus precision placement and hardware safe-area inset clamping).
- **Confirmed Decision 3 (Full App Store Technical & Compliance Suite)**: Deliver the complete technical foundation:
  1. **IndexedDB High-Capacity Storage Engine** (replacing the 5 MB `localStorage` bottleneck with asynchronous IndexedDB persistence and seamless migration of existing worlds, snapshots, and learned AI patterns).
  2. **Offline-First PWA & In-App Install Flow** (Web App Manifest, Workbox service worker caching, offline connectivity indicator, and native/iOS guided install prompt).
  3. **WebGL Context-Loss Recovery & Mobile Frame Pacing** (`webglcontextlost` / `webglcontextrestored` automatic scene reconstruction plus 30/60 FPS battery-saver pacing).
  4. **App Store Trust, Privacy & UGC Compliance Center** (In-App Account & Cloud Data Deletion per Apple Guideline 5.1.1(v) and Google Play Data Safety, Public World UGC Reporting/Blocking, and CC0 Texture Attribution & Privacy disclosures).

---

### 1. Overview & Core Concept

- **What It Does**: Elevates LFS Block Studio from a feature-rich 3D voxel editor into a self-contained, store-compliant creative game and architectural CAD sandbox that runs smoothly offline or online on desktop, Android (including Google Pixel 8 Pro), and iOS devices.
- **Target Audience / Persona**: Mobile and desktop voxel builders, architectural hobbyists, and creative gamers who want both open-ended sandbox tools and rewarding structured goals without hitting storage limits or mobile WebView crashes.
- **Key Value**: Combines the creative freedom of a professional 3D studio (47-tile Connected Textures, self-learning 3D ghost co-pilot, WorldEdit commands, customizable ElvUI-style HUD bars) with the tactile satisfaction, progression loops, and reliability of a top-tier App Store release.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Interactive Onboarding & Daily Prompt Flow**: New builders can step through a concise, non-intrusive 4-step interactive coachmark tour (*Place & Scale*, *Smart Ghost Co-Pilot*, *Double Market & Hotbars*, *Time & Cinema*). A Daily Build Prompt card in the studio hub offers a fresh 24-hour creative theme with one-click starter biome loading.
  2. **Architectural Contracts & Mastery Progression**: Opening the **Contracts & Mastery Hub** presents tiered architectural briefs (e.g., * Cantilevered Watchtower*, *Symmetrical Courtyard Pavilion*, *Glazed Greenhouse Atrium*). As the user places blocks, a live evaluator tracks structural height, footprint volume, material variety, and enclosure, awarding Mastery XP and rank badges upon completion with a celebratory chordal fanfare.
  3. **Procedural Biome & Terrain Generator**: From the Project Center or Contracts Hub, users can preview and spawn multi-layered procedural island templates (complete with stratified stone sub-layers, top-surface biome blocks, and natural perimeter contours) into the entire world or a targeted chunk.
  4. **Cinematic Photo & Timelapse Studio**: Toggling **Cinema / Timelapse Mode** hides all editing chrome into a sleek bottom playback dock. Users can scrub through their build history from block #1 to the finished structure, switch atmosphere presets (*Golden Hour*, *Starlight Midnight*), frame with Rule-of-Thirds or Isometric lenses, and export a high-resolution studio snapshot.
  5. **App Store Trust & Storage Center**: Inside the Main Menu, a dedicated **Storage, Offline & Privacy** tab displays real-time IndexedDB capacity usage, PWA installation controls, CC0 texture credits, public world reporting/moderation controls, and a one-step **Delete Account & Purge Cloud Data** action for signed-in users.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision Architectural Studio meets Tactile Creative Sandbox—clean dark obsidian glass chrome that stays out of the way of the vibrant 3D viewport.
  - *Color Palette & Mood*:
    - Dominant Canvas (`60%`): Dynamic 3D sky dome and horizon-matched atmospheric fog (`#0B0F19` Starlight Midnight to `#1E293B` Studio Noon and `#2A1B18` Golden Hour).
    - Structural Surfaces (`30%`): Deep slate studio panels (`#0F172A` / `rgba(15, 23, 42, 0.92)`) with crisp hairline borders (`rgba(255, 255, 255, 0.08)`), respecting zero `backdrop-filter` overhead over active software WebGL contexts.
    - Accent Budget (`10%`): Indigo studio primary (`#6366F1`), Emerald co-pilot/completion confirmation (`#10B981`), and Amber mastery/contract highlights (`#F59E0B`).
  - *Typography & Hierarchy*:
    - Display & UI Headings: `Plus Jakarta Sans` (SemiBold/Bold 600–700) with balanced headline wrapping.
    - Body & Controls: `Plus Jakarta Sans` (Regular/Medium 400–500) with single-line `whitespace-nowrap` control discipline.
    - Coordinates, Telemetry & Command Line: `JetBrains Mono` with `tabular-nums` for vertical alignment of $X/Y/Z$ coordinates, block counts, and timelapse timestamps.
  - *Component Styling & Layout*:
    - Safe-area inset awareness (`env(safe-area-inset-top/bottom/left/right)`) across all docked and floating HUD bars.
    - Minimum $44 \times 44\text{px}$ touch hitboxes on mobile/tablet modes, keeping fixed top/bottom chrome compact so the central 3D viewport remains unobstructed.

- **Interactive Feedback & Motion**:
  - **Spring-Physics Block Arrival**: Newly placed or auto-completed blocks animate from $0.72\times$ scale to $1.0\times$ with a crisp critically damped spring settle over $160\text{ms}$.
  - **Voxel Break Debris**: Removing blocks spawns 6–10 miniature color-matched 3D voxel fragments that arc outward with gravity and fade cleanly within $380\text{ms}$ using pre-allocated pooled meshes (zero GC allocation in the render loop).
  - **Acoustic Material Synthesis**: Every placement, removal, brush stroke, hotbar tap, and contract milestone triggers a subtle, material-accurate WebAudio transient (mutable via a quick header toggle).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Asynchronous IndexedDB Engine with Transparent Migration**
  - *Chosen Approach*: Build a dedicated IndexedDB storage layer (`lfs_studio_db`) with object stores for `projects`, `snapshots`, `gitCommits`, `customBlocks`, and `patternArchive`, automatically migrating existing `localStorage` records on boot and maintaining an in-memory state cache for zero-latency React reads.
  - *Why*: Eliminates the 5 MB WebView storage wall so users can save dozens of multi-chunk worlds and thousands of learned AI patterns without data loss.
  - *Alternatives Considered*: Keeping `localStorage` with LZ-string compression (still hits hard limits on large multi-chunk worlds and blocks the main thread during serialization).

- **Decision 2: 100% Procedural WebAudio Synthesizer & Pooled 3D Particle Physics**
  - *Chosen Approach*: Synthesize all sound effects dynamically via the Web Audio API (filtered noise bursts + tuned triangle/sine oscillators) and run block break debris through a fixed-size pre-allocated `THREE.InstancedMesh` / object pool.
  - *Why*: Guarantees zero external `.mp3`/`.wav` network failures in offline mode, zero garbage collection spikes during rapid 3D brush sculpting, and instant acoustic variety based on block material finish (Matte, Stone, Metal, Glass, Emissive).
  - *Alternatives Considered*: Loading external audio sprite files (increases bundle weight and can fail offline) or spawning unpooled `THREE.Mesh` particles per block (causes GC frame drops on mobile).

- **Decision 3: Live Heuristic Architectural Contract Evaluator**
  - *Chosen Approach*: Evaluate active architectural contracts purely on client-side spatial geometry metrics (bounding box span, vertical height, block count, distinct material categories, roof/wall ratios, and bilateral symmetry score).
  - *Why*: Runs instantaneously offline with zero server latency, integrates directly with the existing Spatial Co-Pilot analyzer, and gives players real-time progress bars as they build.
  - *Alternatives Considered*: Cloud-only evaluation (breaks offline play and introduces latency).

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        LFS BLOCK STUDIO — CLIENT APPLICATION                     │
├───────────────────────────┬────────────────────────────┬─────────────────────────┤
│   Top Studio Ribbon &     │   Interactive Engagement   │  Main Menu, Compliance  │
│   Atmosphere Quick-Bar    │   & Cinema Overlays        │  & Storage Center       │
│  ┌─────────────────────┐  │  ┌──────────────────────┐  │  ┌───────────────────┐  │
│  │ Time-of-Day Presets │  │  │ Contracts & Mastery  │  │  │ IndexedDB Manager │  │
│  │ Audio / Haptics Btn │  │  │ Daily Prompt & Tour  │  │  │ Biome Generator   │  │
│  │ PWA Install Action  │  │  │ Timelapse & Photo UI │  │  │ Privacy & Account │  │
│  │ Offline Status Pill │  │  │ Modular Multi-Hotbar │  │  │ Deletion / UGC    │  │
│  └──────────┬──────────┘  │  └──────────┬───────────┘  │  └─────────┬─────────┘  │
└─────────────┼─────────────┴─────────────┼──────────────┴────────────┼────────────┘
              │                           │                           │
              ▼                           ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     CORE STUDIO ENGINE & SENSORY CONTROLLERS                     │
│  ┌──────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │ Three.js 3D Viewport │  │ Spatial Audio & Haptics │  │ Progression & Biome │  │
│  │ • Spring Kinematics  │  │ • Material Synth Nodes  │  │ • Contract Verifier │  │
│  │ • Pooled Break Voxel │  │ • Chord Arpeggiators    │  │ • Mastery XP / Rank │  │
│  │ • Pinch/Pan Gestures │  │ • Mobile Vibrate Pulse  │  │ • 6 Island Biomes   │  │
│  │ • Context Recovery   │  │                         │  │ • Timelapse Player  │  │
│  └──────────┬───────────┘  └─────────────────────────┘  └──────────┬──────────┘  │
└─────────────┼──────────────────────────────────────────────────────┼─────────────┘
              │                                                      │
              ▼                                                      ▼
┌─────────────────────────────────────────┐  ┌─────────────────────────────────────┐
│   LOCAL HIGH-CAPACITY PERSISTENCE       │  │   CLOUD & PWA SERVICE LAYER         │
│  ┌───────────────────────────────────┐  │  │  ┌───────────────────────────────┐  │
│  │ IndexedDB (`lfs_studio_db`)       │  │  │  │ Workbox Service Worker +      │  │
│  │ • Projects, Chunks & Snapshots    │  │  │  │ Web App Manifest (Offline)    │  │
│  │ • Self-Learning Pattern Archive   │  │  │  ├───────────────────────────────┤  │
│  │ • Mastery Profile & Streaks       │  │  │  │ Firestore (`worlds`,          │  │
│  │ • Auto-Migration from localStorage│  │  │  │ `blueprints`, `worldReports`) │  │
│  └───────────────────────────────────┘  │  │  └───────────────────────────────┘  │
└─────────────────────────────────────────┘  └─────────────────────────────────────┘
```

#### Data Model & State

- **`IndexedDB Studio Store` (`lfs_studio_db`)**:
  - `projects`: Keyed by project `id`, storing full multi-chunk `PlacedBlock[]`, unlocked chunk coordinates, camera bookmarks, and chronological `buildTimeline` events for timelapse replay.
  - `userProgress`: Stores `xp`, `masteryRank`, `completedContractIds`, `dailyStreakCount`, `lastDailyPromptDate`, `onboardingCompleted`, and audio/haptic/atmosphere preferences.
  - `patternArchive` & `customBlocks`: High-capacity stores for the self-learning 3D ghost co-pilot and user-authored procedural blocks.
- **`ArchitecturalContract` & `BiomeTemplate` Entities**:
  - `ArchitecturalContract`: `{ id, title, category, difficulty, xpReward, requirements: { minBlocks, minHeight, minFootprintWidth, minDistinctBlocks, requireSymmetry, requiredMaterialTypes } }`.
  - `BiomeTemplate`: `{ id, name, description, previewColors, generateBlocks(chunkX, chunkZ, config): PlacedBlock[] }`.
- **Firestore Compliance Collections**:
  - Existing `/worlds/{worldId}` and `/blueprints/{blueprintId}` collections support batch owner deletion during the **Delete Account & Purge Cloud Data** flow.
  - Local + cloud moderation blocklist (`hiddenWorldIds` and report submission handler) so users can immediately hide and report inappropriate public worlds per App Store UGC guidelines.

#### Interactive Component & State Mapping

- **Atmosphere & Time-of-Day Switcher**: Selecting *Dawn Mist*, *Studio Noon*, *Golden Hour*, *Starlight Midnight*, or *Overcast Blueprint* updates directional key light color/position, hemisphere sky/ground tint, exponential fog density/color, and sky dome gradient with smooth frame-rate-independent damping.
- **Multi-Touch & Safe-Area Viewport Handler**: Tracking active `PointerEvent` pointers in `SkyblockViewport` switches cleanly between 1-finger/stylus raycast placement or orbit and 2-finger pinch-distance zoom + midpoint pan, while clamping all floating HUD bars inside `env(safe-area-inset-*)` boundaries.
- **WebGL Context-Loss & FPS Pacer**: Listening to `webglcontextlost` prevents default termination, displays a non-destructive recovery banner, and rebuilds GPU buffers on `webglcontextrestored`; a frame-pacing toggle allows capping the render loop at 30 FPS for mobile battery longevity or 60 FPS for studio responsiveness.
- **Cinematic Timelapse & Photo Dock**: Entering Cinema Mode pauses block editing, reveals a timeline scrubber bound to sorted block `placedAt` timestamps, plays back block construction with spring-in animations and synthesized audio ticks, and provides a 1-click high-DPI PNG render export.
- **Compliance & Account Deletion Flow**: Clicking *Delete Account & Cloud Data* in the Main Menu Compliance tab prompts for confirmation, queries and deletes all Firestore `worlds` and `blueprints` authored by `auth.currentUser.uid`, clears IndexedDB/localStorage if requested, and signs out/deletes the Firebase user record.
