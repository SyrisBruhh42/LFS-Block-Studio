# Contextual cell properties

Recorded 2026-11-01. This is a bounded P4/P5 continuation. P0–P8, source convergence and release acceptance remain incomplete. Native Minecraft/WorldEdit is **NOT_RUN — skipped by user**.

## Experience and ownership

Scene & inspect hands a chosen cell to one modeless **Cell properties** panel. Coordinate tools also offers Inspect cell properties. Resume cell properties returns to the last target and unfinished draft. Opening, browsing, appearance, closing and reviewing are view operations; they do not change the build, selection, history or active brush.

Position, block type, quarter-turn rotation and scale are explicit draft fields. Review shows before/after values and the consequences for selection, instance appearance and chunk visibility. Apply commits through the existing StudioEditorSession in one expected-source transaction and one Undo step. Closing preserves an unfinished draft in this browser session, but revokes its review. Drafts are not saved project content and do not survive page reload.

The inspector view model owns only target identity, draft and review lifecycle. It is not another world, serializer or history. The canonical project remains the session document. Private prepared patches retain the affected cell and any changed chunk configuration, not another complete world. Final complete validation and history admission still run; this is not an incremental-validation or memory/performance claim.

The legacy right sidebar remains mounted and remembers its state while properties uses the dock. Switching to a legacy inspector immediately closes properties and revokes its review. The central canvas remains mounted. On small screens, properties occupies the screen height with a scrollable body; it is still modeless, with explicit close controls and no modal keyboard trap. Other studio regions remain reachable. Arbitrary docking and full-shell migration are not implemented.

## Editing rules

| Concern | Contract |
|---|---|
| Cell identity | Document identity and stable instance ID identify the target. Moving a cell or Undo follows its ID; an unrelated replacement at its former anchor is not captured. A different project cannot inherit the target. |
| Source identity | Session/project/history epoch/edit revision bind the draft and review. Edit→Undo does not resurrect a review. Availability/exclusion gates apply independently. A durable save acknowledgement alone does not make an authored draft stale. |
| Draft lifecycle | Dirty drafts prevent switching to another target until explicitly applied or discarded. Closing preserves values; external edits keep values but block Review/Apply until Reload. Deleted/different-project targets retain dirty drafts without activating them. Old hidden controls or old Apply callbacks cannot apply a later review. |
| Coordinates | Freeform admits exact finite decimal positions within ±1,000,000. The existing schema keys cells by rounded anchors. A different occupied destination anchor rejects atomically; there is no overwrite or nearest-free substitution. Large geometry overlap is not detected. |
| Selection | Explicit selection uses the integer anchor because region commands require whole coordinates. When both corners select this cell, a move tracks the destination anchor. Fractional authored position is retained exactly. Unrelated region selection and clipboard remain unchanged. Undo restores the complete predecessor. |
| Block type | Choose an existing project definition. Stable cell ID and existing instance appearance are preserved. Changing a definition is not a silent appearance reset. Locked Java only offers eligible definitions and final policy validation still decides. |
| Scale | Effective scale is instance override, otherwise definition default, otherwise identity. Definition mode removes the override deliberately; custom mode admits each schema-supported finite axis in 0.01–64. Explicit identity and absent override remain distinct. No implicit clamp to the brush tool’s narrower range. |
| Appearance | Existing color/texture/material overrides survive unless Use definition appearance is explicitly reviewed. The panel does not add an alternate paint pipeline. |
| Chunks | A moved cell reveals its destination chunk if needed. The cell, chunk visibility and followed selection share one commit/Undo. No source changes occur during review. |
| Java candidate | Current exact mapped unit blocks, integer cells and canonical rotation zero; unsupported instance scale/appearance cannot bypass complete policy validation. The UI disables unsupported rotation/scale choices. No native compatibility claim follows. |
| No-op and failure | An unchanged review retains IDs, source counter, history and Redo. Occupancy, invalid data, stale source, exclusion or final history-capacity failures leave complete project/workspace/history unchanged. Commit feedback follows the accepted outcome. |

## Appearance and accessibility scope

One App-owned preferences hook supplies both menu and properties. Actual captured Oasis tokens/icons/notices remain unchanged. Theme, text, control minimum and reduced motion apply to both surfaces. Menu width and the session-only properties width are independent. Existing unsupported preference records remain preserved; no project schema or dependency was added.

The panel uses native controls, labels, fieldsets, disclosures, visible focus and explicit review/close actions. Fields suppress viewport shortcuts while focused; the canvas remains usable outside. A narrow full-height panel prevents the old ribbon from consuming its body. Focus must scroll into the visible body, not merely exist in a clipped zero-height region. Scoped keyboard/reflow checks do not establish screen-reader, physical touch/pen, browser/OS zoom or full-application accessibility acceptance.

## Falsification and remaining work

Any accepted stale Apply, changed occupied cell, hidden draft loss, duplicate submission, policy bypass, no-op Redo loss, incomplete Undo or invisible focused control invalidates this slice’s acceptance. Preserve the failing candidate/receipt and fix the workflow; do not lower the asserted outcome. The browser test exposed fractional selection corners incompatible with existing commands. The implemented fix tracks integer anchors while retaining authored precision. Visual readback exposed a tiny narrow body despite horizontal reflow passing; vertical visibility is separately asserted.

The strategy is a contextual properties surface on the current session. A second authored store would duplicate validation/history and increase drift; a wholesale shell replacement would enlarge the migration boundary. Reconsider this approach if the mounted-session integration cannot satisfy atomicity or measured editing latency. Those alternatives are not current implementation.

| Lens | Benefit / remaining boundary |
|---|---|
| Engineering | Reuses the session and actual definitions; legacy shell remains larger than the intended final UI. |
| Quality | Exact source/draft/report identity and complete Undo; all other action routes still need their own evidence. |
| Operations | Local source and recoverable checkpoints; no new service, provider or release/update mechanism. |
| Security | Plain bounded drafts, no script evaluation/provider use; trusted internal prepared patches are not an imported command API. |
| End user | Find → precise draft → review → Apply → Undo → save/reopen; geometry collision/measurement/repair and full navigation presets remain open. |
| Cost | No new package or infrastructure cost; full validation/cloning remains an unmeasured large-project cost. |

See IMPLEMENTATION_STATUS.md and evidence/20261101-cell-inspector/SCOPE_LEDGER.json for exact final candidates, named cases, failed attempts and limits. Prior menu/brush/history receipts retain their own candidates. Counts are not phase closure.

Recipe/identity continuation: RECIPE_WORKSPACE_CONTRACT.md records the new command placement allocator and identity-preserving command move. The actual recipe App case follows a moved cell through this inspector. Current source/evidence is in IMPLEMENTATION_STATUS.md; the original properties receipts retain their candidate.

Resource-kit continuation: RESOURCE_KIT_CONTRACT.md and evidence/20261101-resource-kits identify current source and 18 added resource journeys. Import/placement/packaging reuse the same session/preferences; menu now has 26 actions and appearance reaches menu, properties, recipes and resources. Earlier App lanes actually reran. Original receipts above retain their historical scope; complete phases and release remain unaccepted.
