# Reviewed command recipes

Recorded 2026-11-01. This advances P2/P4/P6. The complete P0–P8 plan and release remain incomplete. Native Minecraft/WorldEdit is **NOT_RUN — skipped by user**.

## The complete flow

Find actions → Open recipe workspace, or an existing HUD recipe button → compose/load commands → Preview → inspect final impact → Apply → one Undo → save/reopen. Choosing a HUD macro now opens this same review instead of applying immediately. Existing single-command entry remains available. The new workspace uses captured Oasis tokens/icons and the existing App preference owner; it adds no dependency or hosted service.

The native modal owns focus and pauses canvas editing. Opening, composing, loading a preset, preparing, reviewing, downloading and cancelling do not edit the live build. Closing or Escape cancels preparation, revokes the review and retains the draft for this session. Drafts do not survive page reload and are not saved project content. Loading another preset requires an explicit replacement choice when the current draft is dirty. The shelf shows up to 128 existing local HUD recipes; it is not a new project resource store or arbitrary-script runner.

The editor has native fields for name, commands, active block, iteration count, preparation pause and fallback cursor. The pause spaces isolated preparation steps; it does not animate partial changes into the live world. Commands retain their own parameters and do not inherit brush mirrors/scale. Omitted positions follow the existing command's selection/cursor rules; explicit positions remain explicit. The trace records actual resolved commands.

## Source and ownership

StudioEditorSession remains the sole authored/history authority. StudioRecipeModel owns only draft, job and review lifecycle. reviewStudioRecipe prepares an isolated engine proposal through the existing prepareStudioRecipe and command parser. It validates every detached command result against the complete document and shared workspace schema, then validates the final proposal with revealed chunks. The exported workspace validator is the existing implementation, not a second schema. The ID function moved to studioId.ts with the existing studioDocument export retained.

No source, policy, history or success effect is published during preparation. The proposed cells, definitions, selection, clipboard and revealed chunks enter one expected-source session transaction on Apply. Final schema/policy/workspace/history admission still decides; a too-large retained change can reject after preview without publishing any partial result. There is no promise that a preview reserves storage/history capacity.

Project/session/history epoch/edit revision bind a review. Draft edits, cancellation, closing, a new job, source change or unavailable write authority revoke it. Edit→Undo does not revive it. Duplicate Apply and a cached old Apply callback cannot apply a newer report. Cancellation is cooperative between bounded synchronous commands. A producer ignoring cancellation cannot publish old progress or results into a new context. Commands may be retained across project switches, but must explicitly preview against the new project before Apply.

## Exact block references and identity

`{active}` must occupy a complete block argument and resolves to `@definitionId`. `@id` means an exact, case-sensitive project definition, with no alias/name fallback. A missing exact reference fails. Ordinary friendly aliases remain available. Air/0/none retain their command meaning; `@air` can refer to an actual project definition called air. The active block cannot select a command name or inject additional arguments.

The old coordinate-derived IDs caused two observed defects: placing at a moved cell's former coordinate could duplicate its ID; deleting/rebuilding an anchor could make the inspector capture the new cell as the old one. New command and blueprint placement uses the existing cryptographic ID generator with a bounded collision check. Existing destination anchors keep their identity; new anchors receive fresh IDs. Command moves retain each moved source cell's ID. Initial static starter IDs remain readable. Whole template reset and blueprint load use the same placement allocator for new placements.

Unchanged final placement content reuses the source cell identity. A repeated recipe whose final document and workspace match is a no-op: source, IDs, history and pending Redo remain unchanged. A recipe that changes only selection or clipboard still creates a reversible workspace edit. The summary reports actual final differences rather than summing intermediate command counts.

## Review and downloadable data

Summary shows before/after totals, added/updated/removed/unchanged cells, net material counts, selection/clipboard/definition changes and revealed chunks. Changed cells are searchable/filterable and paged 25 at a time, with exact before/after properties. Selection & clipboard and Command trace expose deeper consequences. Native focus scrolling keeps a focused control in view, including the large command field at 320 CSS pixels/200% scoped text.

The local JSON download is `lfs-studio-recipe-review` version 1. It includes the live source token and durable/policy envelope captured at preparation, resolved trace, all changed cells/definitions, revealed chunks, selection summaries and exact changed clipboard data. Unchanged clipboard payloads are omitted; their counts remain visible. It is an exact change report, not a complete editable backup or source-file hash attestation. Original current projects remain independently downloadable through the existing backup path. A browser download request is not proof of OS file-save completion.

The workspace data view shows up to 65,536 characters; the download contains the complete admitted review. No silent truncation of the actual review or applied proposal is allowed. Source/preview changes revoke a pending report's use by the UI. Ordinary durable save acknowledgement can advance the saved envelope without changing the authored token; the report retains its captured envelope.

## Bounds and failures

| Boundary | Current rule |
|---|---|
| Commands | 1–32 nonempty command lines, up to 4,096 characters per command and resolved command; blank lines ignored. |
| Script | Up to 131,104 characters. Saved macro array entries must each occupy one line; embedded newlines do not silently become extra commands. |
| Repeat | 1–16 iterations, at most 64 total command steps. No recursion, arbitrary JavaScript or shell execution. |
| Preparation pause | UI admits whole milliseconds 0–10,000. Zero still yields between commands. |
| Work | Existing 100,000 current-plus-result block-count proxy charged per step; existing preallocation bounds remain. This is not exact cell examination, heap, latency or device capacity. |
| Review | At most 32 MiB of exact JSON. Oversize review fails before Apply; split the recipe explicitly. This limit is separate from project input and retained Undo limits. |
| Admission callback | Synchronous and returns nothing. Async functions and mistaken returned Promises reject; they cannot silently skip step admission. Trusted callbacks are application code, not an imported-code sandbox. |
| Identity allocation | Existing anchor ID or a fresh cryptographic ID; at most eight collision attempts. Failure rolls back the complete transaction. |
| Game lock | Current exact captured-definition rules apply after every step, including an intermediate forbidden result that a later command would replace. No implicit unlock/substitution or native qualification. |
| Errors | Failed command index and reason, retained draft, no partial authored result. An accepted recipe undoes once, including selection, clipboard, definitions and revealed chunks. |

Full validation/cloning and a detached working world still exist. The retained preview/report and native text control are bounded but not measured performance guarantees. Physical input, assistive technology, OS/browser zoom and whole-shell accessibility are unqualified. The preview is a change review, not a 3D ghost renderer or historical replay.

## Evidence, falsification and continuation

The current evidence directory and SCOPE_LEDGER bind source, bundle and named checks. Domain fixtures reproduce identity collisions, deleted-ID reuse, wrong-cased active material and the air-name erase before their fixes. Actual App fixtures compare the complete downloaded accepted change report with the resulting project, exercise clipboard through a real paste, and check exact Undo/Redo. They also cover native entry paths, cancellation, draft replacement, source switch, exact references, locked intermediate failure and save/reopen.

The first narrow keyboard run found a partly clipped textarea; production focus scrolling was fixed and the full-control assertion retained. A Java fixture was corrected to keep an unmapped definition unused while locking the world. An intermediate application dispatcher terminated with exit 143 for an unknown reason; its completed child receipt and process-state check were preserved. A terminal dispatcher does not imply product success or failure. Current acceptance requires actual final lane receipts, not inferred completion.

Any silent wrong material, alias fallback for `@id`, resurrected cell identity, stale/duplicate Apply, partial commit, no-op Redo loss, missing reported effect or invisible focused control invalidates this slice. Preserve the counterexample and reopen its gate. A green build or report hash cannot clear native/device/provider/release acceptance.

Engineering reuses the session/parser and removes the immediate macro-apply path. Quality gains exact proposals and rollback checks. Operations adds no service and retains recovery packages. Security keeps plain bounded data and no executable imports/providers. Users gain reviewable command depth with one Undo; broader shell/palette/precision polish remains. Cost adds no package or ongoing service, while full validation remains an unmeasured local cost.

Continue P1 lifecycle/pins/named copies and remaining G2 routes, source convergence and P4 shell/resource consolidation. P6 still needs portable offline kits/prefabs, richer diagnostics/completion and any admitted linked-update workflow. CodeMirror is unnecessary for this first native editor; reconsider it only for a measured editing need and exact license admission. P5/P7/P8, useful Java palette and native qualification remain separate work. Do not mark the full roadmap complete from this slice.

Resource-kit continuation: RESOURCE_KIT_CONTRACT.md and evidence/20261101-resource-kits identify current source and 18 added resource journeys. Import/placement/packaging reuse the same session/preferences; menu now has 26 actions and appearance reaches menu, properties, recipes and resources. Earlier App lanes actually reran. Original receipts above retain their historical scope; complete phases and release remain unaccepted.
