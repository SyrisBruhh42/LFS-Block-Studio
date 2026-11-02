# Experience specification — revised planning authority

This specification is a target experience, not current acceptance. The first G4 release includes a minimal searchable scene/selection list; advanced selection sets and grouping follow in G5. Text size, hit-area size, panel widths, outlines, camera controls and render quality have independent preferences and representative combination tests. The current baseline is in `IMPLEMENTATION_STATUS.md`. Ordinary authored repairs commit/undo once. **Profile transitions are the exception:** compatible lock toggles use a durable checkpoint/new history epoch; version changes or incompatible conversions open a separate copy. Earlier blanket undo wording does not override this policy.

# Block Studio — navigation, accessibility and creative-workflow expansion

Prepared 2026-11-01. This extends the existing upgrade plan at source baseline `f2de5949594202e57fda9dc38cea7bf3634825ab`. It is a proposed experience specification, not implemented functionality. **Minecraft Java Edition with WorldEdit `.schem` remains the confirmed first compatibility target.** Exact game, importer and serialization versions still require qualification.

## Direction

Aim for a creative workstation that feels immediate, precise, adaptable and forgiving. The visible interface should stay calm while every deeper tool remains reachable through context, search or a saved workspace. A sophisticated interface should reduce the effort between an idea and a correct build.

The current app already has orbit controls, flight, touch gestures, stylus handling, remappable keys, blueprints and command previews. The first improvement is consistency: repair conflicting keys, overlapping input ownership, partial accessibility settings and inconsistent edit/history behavior before multiplying controls. The separate source-backed research notes identify exact files and current API support.

## 1. Navigation that fits the task

| Navigation context | What users should get | Priority |
|---|---|---|
| **Orbit / precision editing** | Orbit around selection, clicked surface or custom pivot; visible pivot; screen-plane or ground-plane panning; zoom to cursor; adjustable sensitivity and optional damping | First: refine existing controls |
| **Plan / elevation** | True orthographic top/front/side views, floor/slice selector, grid stepping and stable map-style pan; preserve apparent scale when changing projection | Next: new projection and slice behavior |
| **Fly / creative movement** | Existing WASD flight refined with slow/fast speeds, configurable inversion, optional acceleration, visible exit and return-to-previous-view | First: refine existing controls |
| **Walk / inspect** | Eye-height, body-clearance and route inspection with declared collision rules, no accidental editing, immediate return to editor | Later: requires real traversal semantics |

Walk mode is an editor preview, not Minecraft physics or gameplay proof. Camera mode, input preset, workspace layout, theme and game lock are separate state. Changing any navigation preference must not alter project data or game permissions.

Offer **Studio**, **Minecraft-style**, **Blender/CAD-style**, **Trackpad**, **Touch/Pen** and **Custom** input presets after mapping tests. These are familiar interaction conventions, not imports of another product's code or branding. Show a small live controls legend matching the selected preset. Let users remap mouse buttons, wheel behavior and modifiers as well as keys; offer hold/toggle alternatives, left-handed layouts, separate movement/look speed and a preset reset.

Treat the following as essential conveniences:

- Frame selected, frame all, Home and Previous view, with camera history separate from build undo.
- Labeled view cube plus equivalent buttons and keyboard actions; named bookmarks and optional camera paths.
- Explicit Pan tool plus visible step-pan, step-orbit and zoom controls, so dragging, a wheel, a middle mouse button or a multi-key chord is never required for basic navigation.
- Stable zoom/pan around the working surface, scene-aware clipping and distance limits, and a “lost camera” recovery action.
- Optional split perspective/orthographic views after the renderer can support their cost. Keep one active input owner; do not duplicate an entire editor per viewport.

A gesture must choose its owner at the start. Panning must never erase on release; typing must never fly; closing a menu must not place a block underneath it. Pointer cancellation, loss of capture, window blur and unplugged controllers must stop the current interaction. Touch/pen behavior needs actual hardware tests; a browser pressure field does not establish palm rejection. Gamepad support is a later input adapter with dead zones, accessible menus and disconnect recovery.

## 2. A contemporary, coherent interface

Use the Oasis semantic themes with a stable central canvas, one contextual inspector and a resource drawer. Keep the game target and compatibility lock visible. Do not recreate the whole Oasis shell or add every advanced panel permanently.

| Experience improvement | Concrete behavior |
|---|---|
| **Searchable action bar** | Search tools, settings, block IDs, saved recipes and help. Results show current shortcuts and explain unavailable actions. Search never executes an edit merely by selecting a result that needs parameters. |
| **Contextual selection toolbar** | Relevant actions near a selection, with a fixed-toolbar alternative. Compact list by default; optional radial menu for users who prefer it. Keep it out of the cursor's way and usable without precise gestures. |
| **Expandable inspector** | Simple properties first; exact dimensions, block states, coordinates and diagnostics on demand. Users can pin frequently used sections. |
| **Saved workspaces** | Named layouts such as Build, Precision, Commands and Present; local customization and recoverable reset. Layout names do not change authority or silently alter tools. |
| **Stable panels** | Dock, resize and collapse; recover off-screen panels; keep keyboard focus predictable. Do not auto-reorder menus while a user is reaching for an item. |
| **Legible feedback** | Distinguish hover, selection, proposed changes, invalid cells and locked content with labels/patterns plus color. Pending work is visible; optimistic appearance is not a save receipt. |
| **Optional polish** | Short, cancellable transitions; restrained tactile feedback, sound and haptics; no mandatory ambient motion, blur or audio. Reduced-motion and mute options apply throughout. |

The [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) can animate interface state changes, but should be an optional enhancement with immediate fallback. It does not improve the editor's data model or make a slow operation fast. Do not animate the camera just because a panel opens, and do not make dark translucent surfaces the only readable appearance.

## 3. Accessibility as an editing capability

Accessibility should extend into building itself, not end at the settings menu. Provide a searchable scene/selection list with names, coordinates, dimensions, block state and editable properties. Users should be able to select a region, change a coordinate, choose a block, preview a command and export without relying entirely on a 3D mouse gesture.

- Full keyboard paths and visible, unobscured focus; explicit entry/exit for viewport keyboard controls; no keyboard traps.
- Single-click/tap alternatives to dragging: move-to fields, nudge buttons, pick-start/pick-end selections, panel-position menus and numeric sliders. Keyboard alternatives alone do not satisfy the single-pointer alternative described in [WCAG dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Adjustable UI text, density, panel width, pointer hit areas, selection outline and crosshair independently. Offer large targets without forcing giant text, and large text without losing controls.
- Use the Oasis product targets of at least 36px desktop controls and 48px touch controls where applicable, with both dimensions/spacing checked. These are product choices; WCAG 2.2 AA's target-size criterion is 24×24 CSS pixels with exceptions, not a blanket 48px rule. [W3C criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Test ordinary controls/text at 200% text scaling and a 320-CSS-pixel equivalent/400% desktop zoom scenario. The intrinsically two-dimensional canvas has a relevant reflow exception; surrounding forms and menus are not blanket-exempt. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- High contrast, adjustable outline thickness and shape/text status; avoid color-only dimensions, locks or errors. Check authored labels against their real background.
- Reduce camera easing, shake, flashes and animated placement; independent sound/haptics controls; no information available only by audio or vibration.
- Screen-reader announcements for completed operations, selection counts and errors, not every pointer movement. Numeric and list-based editing needs user testing, not merely ARIA labels attached to a canvas.

Do not claim WCAG compliance from a component library, automated scan or token palette alone. Establish critical task tests with keyboard, screen reader, touch/pen and users of the relevant assistive methods.

## 4. Separate the meanings of scaling

| Scale | Meaning and policy |
|---|---|
| **Interface scale** | Text, controls, panel arrangement and hit areas; preserve browser zoom and user preferences |
| **Camera scale** | Zoom, viewing distance, clipping and navigation speed; never changes the build |
| **Geometry scale** | Actual dimensions/transforms; Java lock only permits operations representable as valid native cells/states, including explicitly generated multi-block transformations |
| **Rendering scale** | Pixel ratio, shadows, distant detail and animation cost; affects display only, not saved geometry or export fidelity |
| **World scale** | Supported scene size, sparse/dense layouts, material variety and retained history; publish measured limits per target device/profile |

Display density is not constant across zoom or monitors: browser page zoom can change `devicePixelRatio`, while pinch zoom behaves differently. Keep canvas resolution policy separate from UI sizing and test monitor changes. [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).

## 5. Building tools with professional depth

1. **Precision kit:** grid/workplane/face/anchor snapping, visible snap target, axis constraints, adjustable pivot, align/distribute, measurement guides, numeric offsets and one-action undo.
2. **Selection kit:** box/lasso where supported, select connected/same block/same state, saved selection sets, overlapping-object cycling, visible-only versus select-through, hide/isolate/lock. Make the scope obvious before edits.
3. **Inspection kit:** true orthographic views, floor stepping, section planes and ghosted surroundings. Hiding or clipping a floor does not remove it from a full-world export unless explicitly requested.
4. **Repetition kit:** repeat-last with editable parameters, line/grid arrays, mirror and region operations; stairs, walls, roofs and terrain recipes over the same bounded action system. Show the complete affected count even when the preview is simplified.
5. **Reusable kit:** named prefab anchors, versions, variants, linked versus independent instances, and detach. Preview the impact of updating shared definitions.
6. **Material/state kit:** favorites, recent picks, eyedropper, palette swaps and batch replacement with state-preservation checks. Locked Minecraft blocks use supported states; arbitrary tint is not a native block variant.
7. **Command kit:** forms and readable commands describe the same operation; completion suggests only valid target options; inline errors, dry run, cancel, parameter presets and a reusable recipe shelf.
8. **Minecraft planning kit:** bill of blocks, bounds, origin, layer-by-layer construction views and unsupported-feature report. Stack counts need verified per-item rules; a material list alone is not survival-build or gameplay validation.
9. **Review/presentation kit:** named checkpoints, before/after changes, annotations and clean captures. True build replay requires recorded operations; the current sorted-block reveal must not be presented as historical replay.

All these tools share one transaction and target-validation boundary. A visual graph or AI suggestion is another producer of proposed edits, never an alternative way to bypass the game lock.

## 6. Auto-resolve with clear boundaries

Separate **automatic assistance**, **reviewable fixes** and **actions that must stop**. The system should explain the rule, show affected objects and preserve a way back.

| Level | Examples | Required behavior |
|---|---|---|
| **Automatic, reversible interface maintenance** | Clamp a panel back on screen; suggest/recover a usable camera; normalize nonsemantic display metadata; adjust display quality under an enabled adaptive policy | No authored content/permission changes; disclose the adjustment; allow reversal or disable the policy |
| **One-click reviewed repair** | Replace an unsupported block; align off-grid imported cells; repair missing prefab references; resolve overlaps; remap stair orientation; migrate a profile | Show affected count and before/after differences, including loss and substitutions; preserve original/copy; validate all results; commit atomically with undo for ordinary repairs; use checkpoint/epoch or copy for profile transitions |
| **Stop and resolve explicitly** | Corrupt/ambiguous source, unknown game version or registry, irreversible deletion, unsatisfied ownership permission, cloud conflict, unsupported data that cannot be preserved | Do not guess, silently drop data, grant permissions or overwrite newer work. Keep the original and explain the unresolved decision |

Even apparently safe snapping changes geometry if applied to an existing project, so it belongs in reviewed repair. Keybinding conflicts can be detected automatically; choosing which established binding to replace needs a visible choice. Camera rescue must not move the build. Optional AI can suggest alternatives but never promote uncertainty into an automatic fix.

A proposed fix batch contains the source/project/profile/registry revisions, validator version, rule IDs, affected IDs, estimated size, exact changes, losses and inverse changes. At Apply, require the relevant revisions to match. If they change, recompute or reject the batch; a recomputation that changes affected objects, edits or losses requires a new preview and fresh Apply, not inherited approval of the stale plan. Detect fix cycles; offer one coherent resolution rather than repeatedly “repairing” competing rules. Retry only operations with an explicit idempotency/revision contract, never blind writes after an uncertain cloud outcome.

## 7. Quality of life and resilience

Make recovery ordinary: local save status that reflects transaction completion, recovery checkpoints, undo grouped by intention, a durable project export, and clear restore previews. Keep device/input/layout preferences separate from project content. Show a reason when an action is disabled and a useful next step when it fails.

Useful convenience details include recent projects, pinned assets/actions, repeat-last, export presets with immutable target identity, duplicate-project experiments, a command/help search, a contextual shortcut legend, cancellable progress, and reopening the last workspace safely after hydration. Do not auto-reorganize user toolbars from usage statistics; offer explicit suggestions.

For smooth larger worlds, improve existing resource ownership and incremental updates before adopting another renderer: dirty chunks/blocks, appropriate instancing, bounded caches, disposal, coarse picking, and worker jobs with cancellation/backpressure. Offer Balanced, Quality and Low-power presentation presets, with optional adaptive changes that preserve precise editing. Test resource restoration after graphics context loss; context loss can occur for reasons outside the app. [MDN context-loss guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost).

WebGPU, richer procedural graphs, gamepad, split views and collision-aware walking are later experiments with fallback and measured benefit. A renderer's advertised fallback does not prove current materials, exports or recovery are compatible. Keep local building, basic menus and recovery useful without an AI provider or paid service.

## 8. Delivery priority and validation

This expansion complements the existing A–G implementation slices; it does not demote save correctness or the confirmed Java/WorldEdit export path.

| Delivery | Highest-value scope | Evidence required |
|---|---|---|
| **First coherent experience** | Shared input/action ownership, stable orbit/fly, explicit pan, frame/return view, hotkey conflict handling, contextual inspector, search, usable text/target sizing, dependable undo/save | Zero navigation-induced edits in test flows; no typing-triggered movement; keyboard/tap alternatives; restored project equality; game lock enforced |
| **Precision and accessibility expansion** | Orthographic/slice views, bookmarks, advanced selection sets/grouping, measurement/snapping, validated recipes and visible repair panel; the minimal searchable scene/list editing path ships in the first experience | Equivalent results through pointer/numeric/command paths; focus and screen-reader task tests; exact block-state/coordinate tests; reviewed fix rollback |
| **Scale and premium workflows** | Prefab variants, bounded asset catalogue, incremental rendering, optional split views, adaptive quality, advanced command editing | Named workload/device benchmarks; stable memory; cancellation; no export changes from display optimizations |
| **Experimental lane** | Collision-aware walk, gamepad, optional WebGPU, richer visual recipes and carefully scoped model assistance | Useful task improvement and platform parity demonstrated before default enablement |

Measure task outcomes: time to frame a target, accidental edits during navigation, operations to complete a small build, discoverability of a hidden tool, recovery from an interrupted save, and export round-trip fidelity. Use representative beginners and experienced builders; report distributions/errors rather than an invented “UX score.” No performance or accessibility result has been measured for these new proposals.

Six tradeoffs: engineering needs one input/domain model; quality needs repeatable fixtures; operations needs recovery and diagnostics; security needs bounded actions and existing authority; users need predictable controls and genuine choice; cost control favors local deterministic work and reuse of the current stack. More controls are justified when they reduce a real task's effort or errors.

## Supporting research

- `reviews/navigation-experience.md`: source defects, camera/input architecture and primary API sources.
- `reviews/accessibility-recovery.md`: accessibility criteria and repair/recovery contracts.
- `reviews/authoring-performance.md`: precision tools, scalable rendering and current Three.js capability boundaries.

This request added planning and research documents only. No production implementation, new dependency installation, native Minecraft test, device qualification or provider action occurred.
