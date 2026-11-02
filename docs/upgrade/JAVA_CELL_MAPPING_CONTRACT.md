# Candidate Java cell mapping contract

2026-11-01. Implemented pure mapping adapter: `src/engine/javaCellMapping.ts`. This is a source-backed conversion contract for the four-state candidate in `javaProfile.ts`, **not native registry verification, approval to convert, or a compatibility-lock acceptance receipt**. The caller must review assignments, bind them to the current document/session/edit revision, and apply any conversion through the authoritative session and durable transition boundary.

## Coordinates and representability

`SkyblockViewport.tsx` places the mesh group directly at `PlacedBlock.position` and applies its Y rotation. `legoGeometry.ts` computes width/depth from definition dimensions and scale; height is `heightPlates / 3`. A nominal unrotated unit box spans `[x−0.5,x+0.5] × [y,y+1] × [z−0.5,z+0.5]` in renderer coordinates. Canonical Java cell address is **the same integer `(x,y,z)`**. Its minimum corner in Java geometry is `(x,y,z)`: translate renderer points by **`(+0.5,0,+0.5)`**, with unchanged axes and signs. Do not subtract half a cell from the stored anchor or round fractional anchors. The native placement/offset convention remains subject to the candidate's native trial.

The initial adapter admits `brick`, `cube`, `plate`, or `tile` only with width/depth exactly `1`, height exactly `3` plates, no studs/voxel payload, zero rotation, and absent or identity default/instance scale. These shape names share the standard box renderer branch. Nonunit dimensions, compensating scale, arbitrary transforms, per-instance color/texture/material overrides, slopes, arches, cylinders and micro-voxels reject. This deliberately narrow subset can expand only with a revised contract and fixtures.

This is **nominal cell occupancy**, not literal mesh or appearance equality. The renderer's presentation inset (`0.008` when isolated), procedural textures, materials, lighting and connected variations are not Java geometry/state. Every material assignment is an explicit reviewed substitution. A mapping does not promise identical color, transparency, illumination or texture orientation. Source projects remain unchanged.

## Explicit bindings and deterministic identity

`captureJavaDefinitionBinding(definition, blockState)` captures an explicit proposed assignment. No color/name heuristic or default assignment exists. `JavaDefinitionBinding` contains `definitionId`, `definitionSignature`, and `blockState`. The signature is version-prefixed canonical JSON of the complete admitted definition, including name/appearance and optional metadata; a changed definition invalidates its captured binding. Calling the helper alone does not prove human review.

`validateJavaDefinitionBindings(value)` independently validates bounded canonical captures, unique IDs and admitted states. Unused bindings may reference absent definitions; malformed unused bindings still reject. `identity` is the exact canonical serialization of the mapping contract plus bindings sorted by ID. It is **not a hash, signature, authorization mechanism, or native registry receipt**. Store/compare the exact identity; if a compact digest is later needed, hash these exact bytes using an explicitly named algorithm outside synchronous document validation and retain the canonical content.

`JAVA_CELL_MAPPING_CONTRACT` pins mapping/validator/signature revisions, exact candidate/subset identity, coordinate/geometry/appearance/air/rotation policies and limits. The subset identity includes profile ID, Java version, DataVersion, schema version and ordered block states. Native qualification stays `not-run`.

## Validation and output

`validateJavaCellMapping({blocks, definitions, bindings, bounds?, anchor?})` synchronously maps **every supplied placement**. It never clips or edits the source. Success returns frozen `cells`, `bounds` and `report`; failure returns stable-code `issues` and `issuesTruncated`, with **no partial cells**. Duplicate cell occupancy/placement IDs, wrong dictionary keys, missing definitions/bindings, changed captures, unknown fields, getters and unsupported states reject.

Bounds are inclusive canonical cell addresses. Omission derives occupied bounds; an empty world returns `bounds:null` and needs an explicit scope before encoding. Explicit empty bounds describe an all-air region. Missing cells within bounds become air under the encoder's policy; assigning an occupied source cube to `minecraft:air` is forbidden. Anchor is never inferred: omission remains `null`. Passing an explicit anchor and non-null bounds produces cells compatible with `JavaSchematicInput`; the caller still supplies name and source identity and runs encoder preflight.

Work limits: 100,000 placements, 4,096 definitions/bindings, 100 reported issues, coordinates within ±1,000,000, dimensions ≤65,535 and dense selected/derived volume ≤100,000. Signatures are capped at 4,096 characters. These are application budgets, not Minecraft world limits or frame-rate claims. Sparse far-apart placements can fail dense bounds even when placement count is small. This is synchronous bounded work, not a worker or hostile-code sandbox.

## Evidence and integration obligations

`javaCellMapping.test.ts` covers asymmetric/negative axes, renderer nominal bounds and half-cell translation, encoder offset compatibility, all three solid assignments, implicit air, changed captures, unsupported geometry/transforms, overlap, finite coordinates, dense bounds, malformed/accessor data and deterministic immutable output. These are local structure/geometry-contract tests, **not Minecraft, WorldEdit or browser rendering qualification**.

The caller remains responsible for admitted blueprint/clipboard libraries, all mutation routes, stale preview checks, atomic profile/epoch activation, recovery history and export scope. Mapping bindings are data and never themselves grant write authority. Native paste, post-tick comparison, save/reload and export-back remain mandatory under `JAVA_PROFILE_CANDIDATE.md`.
