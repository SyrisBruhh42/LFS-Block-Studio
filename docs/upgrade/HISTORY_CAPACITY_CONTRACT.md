# Reversible history and self-opening project backups

Implementation slice, 2026-11-01. This addresses the P1 load/history mismatch without raising the existing limits or weakening the single-session authority. P1 lifecycle/retention and all-route G2 remain open. Native Minecraft/WorldEdit stays NOT_RUN — skipped by user.

## Observed defects and change

The previous mounted session serialized a complete authored document and workspace for every history step. Its 16 MiB allowance therefore rejected even a rename in an otherwise valid 20 MiB project; the document loader admits up to 32 MiB. Separately, the project download helper pretty-printed objects, so a compact admitted file near 32 MiB could download beyond its own input-size guard.

The session now retains reversible changed data in `studioHistoryDelta.ts`. Object changes preserve exact missing/present values and enumeration order, including dictionary keys restored in the middle. Arrays use nested element changes or a changed middle segment with unchanged prefix/suffix. Both before and after values are captured once. No new authored store, operation authority or persistent history schema was introduced.

Project object downloads now use compact JSON. Explicit source strings retain their exact text, including original whitespace. No fields are removed to fit a file limit. Raw recovery/original-download fidelity remains a separate requirement.

## Admission and restore contract

- Load/parse/schema allowance remains 32 MiB, with the existing coordinate/node/nesting/content limits. It is a rejection ceiling, not supported interactive capacity.
- One session retains up to 30 entries across Undo and Redo combined, within 16 MiB of encoded change payloads, labels and fixed entry overhead. Both directions count once. This is retained encoded data accounting, not a JavaScript heap/RAM guarantee.
- Capture compares complete validated authored content and workspace. It records missing values separately from null/false/zero, and preserves array and object enumeration order. Unchanged data is not serialized into a history entry.
- Encoded capture bounds UTF-8/escaping while writing its payload. The diff still traverses bounded canonical project/workspace structures; complete validation/cloning and transient allocations remain. No latency, heap or large-scene rendering claim follows.
- A new transaction validates the complete next document/workspace and its target policy, captures both history directions, and trims a copy of the old history before one publication. Rejection/no-op preserves prior document/workspace, live token, Undo/Redo and success effects. A too-large changed-data entry rejects the entire edit with a separate-project-copy explanation.
- Undo/Redo checks changed endpoints, containers, array lengths and key ordering, applies to a new state, validates the complete document/workspace/policy, then moves the same retained entry between stacks. Unchanged current content remains authoritative. No partial restore publishes after an error.
- Acknowledging a save advances durable metadata while preserving later content, session identity and both history directions. History never restores an old durable revision or target policy. Verified project/policy installation rotates the session and clears live history/workspace as before.
- Deltas are private trusted-session data, not an imported command/patch language. There is no file/UI route for submitting them. Complete schema validation and source tokens remain mandatory; the delta codec does not replace them.

Project details exposes available Undo/Redo steps, retained bytes and the separate project-file allowance. Undo remains session-only; a save or project backup preserves the authored build, not live history. Retiring old in-memory Undo steps is separate from deleting durable recovery data. No IndexedDB retention/pruning or checkpoint-pin lifecycle is implemented by this slice.

## Large candidate records and exact rescue

A real near-limit backup exposed a separate storage defect. Chromium serialized the normalized JSON string and exact original strings into 134,210,038 bytes, exceeding its 133,169,152-byte per-value ceiling. The current project remained active. This was a backend record-size failure, not the authored JSON input-size guard or a measured browser quota.

Candidate records now conditionally store normalized JSON as a bounded Uint8Array with `jsonEncoding: 'utf8-json-v1'` when normalized JSON plus originals exceed one 32 MiB project allowance. Exact original strings retain their original code units. Legacy small/string records remain supported. Record encoding is separate from document schema/target policy; the IndexedDB version and ordinary revision format are unchanged. Older applications are not qualified to open new encoded candidates.

- Known encoded JSON requires an exact marker, Uint8Array, at most 32 MiB and strict valid UTF-8. Unknown codecs, wrong representations, damaged bytes or oversized data fail closed without activation.
- Original-source lists require at most 64 undecorated entries, unique 1–512-character source IDs, exact data fields and at most 32 MiB aggregate UTF-8. Getters are rejected without execution. Both staging and loading enforce this bound.
- Verification/readback and the final activation/policy transaction compare complete normalized JSON and exact originals, plus exact state/identity and expected source/durable identity. Original-source bounds are checked again before a direct code-unit comparison; malformed final lists are not serialized for comparison. Final decoding/content checks are synchronous inside the IndexedDB transaction. Tampering after readback rejects without advancing the active pointer.
- Raw recovery can expose exact bounded stored document bytes even for unknown/damaged codecs. A typed array need not be silently coerced into a JSON envelope. Independent decoded text and accepted original parts remain available when possible.
- Damaged UTF-16 originals cannot use a direct UTF-8 text download. A bounded individual source JSON envelope preserves their code units through JSON escapes; its contents are independently checked after parsing. Neither byte rescue nor envelope download activates a project.
- Application limits apply after the browser clones the selected record. This does not guarantee rescue of arbitrary objects, browser-owned allocation safety, quota, older-app rollback or other engines.

## Evidence and remaining qualification

Final candidate: **index-Ca-k58z3.js / index-Bi0et0sU.css**. The final domain suite has 277 passing tests across 25 files, including exact-fit/over-limit/UTF-8 admission, complete session history/durable acknowledgements, unchanged 20 MiB content, deterministic full-state sequence oracles, dictionary ordering, array splices, malformed changes and prototype/sparse-array rejection.

The direct sealed-predecessor/current comparison executes both session implementations on the same 20,992,775-byte validated fixture. The predecessor rejects a rename unchanged; the new code applies it with 274 retained bytes, restores the exact serialized document on Undo and applies Redo. This supports the history defect/fix, not performance claims.

The final actual App capacity suite passes all four cases on Ca. Its 20,972,951-byte project retains 804 bytes after three edits; complete payload hashes and actual Undo/Redo/save/reload agree. An actual 33,552,384-byte downloaded compact backup reopens as a distinct project with matching authored content. The former pretty representation would be 33,598,640 bytes and exceed the 32 MiB guard.

All nine final App lanes pass 78 named cases. Separately scoped backend/mounted fixtures pass 107 cases: encoded 10, store 11, policy 21, raw recovery22, hook 36 and recovery UI 7. These are scoped Chromium/disposable fixtures, not universal route, device, quota, native or release qualification. Exact receipts and retained intermediate/failed checks are in evidence/20261101-history-capacity. Initial observer errors concerned error capitalization and an empty-array no-op; a fixture syntax error was fixed before browser execution. The near-limit storage error was real and is retained.

## Decision boundary and remaining work

The leading design is a small session-private change codec with complete validation, existing native persistence and independent rescue. A generic patch library or a new state store would add admission/migration cost without current evidence of benefit. Reconsider the codec if supported edits cannot preserve exact canonical states/order, measured latency or memory remains unacceptable after bounded fixes, or missing endpoint invariants admit stale/partial restoration. Compare alternatives on complete-state fixtures before replacement.

Stop dependent acceptance on an unexplained document/workspace/order difference, lost Redo, stale or partial restore, wrong byte accounting, original-text alteration, backup that cannot reopen inside its allowance, final CAS mismatch or target-policy bypass. Preserve originals and keep independent recovery useful. Retention/checkpoint pins, named-copy limits, prolonged autosave/quota, cross-browser/older-app/update recovery, full G2 and P0–P8 remain open. Native Minecraft/WorldEdit remains NOT_RUN — skipped by user.

Historical scope note: the capacity slice above records Ca/D3 and its own receipts. The later brush/input slice rechecks actual final-App capacity/save/reopen/history behavior and current domain contracts; its source/candidate/counts are in IMPLEMENTATION_STATUS.md. Primary persistence files remain byte-identical. Older backend cases are not automatically promoted across engine changes.

Recipe continuation: the current `index-DFll7Gh7.js / index-BDAYFgj1.css` candidate reran all four App capacity cases and 107 persistence/recovery harness cases. The 20,972,951-byte project now retains **836 bytes** after three edits, reflecting longer fresh placement IDs; the historical Ca result above remains 804 bytes. Complete authored content, Undo/Redo/save/reopen and the actual 33,552,384-byte backup/copy pass in the named fixtures. See `evidence/20261101-recipe-review/SCOPE_LEDGER.json`; these are correctness results, not measured interactive capacity or a general browser quota guarantee.

Resource-kit continuation: RESOURCE_KIT_CONTRACT.md and evidence/20261101-resource-kits identify current source and 18 added resource journeys. Import/placement/packaging reuse the same session/preferences; menu now has 26 actions and appearance reaches menu, properties, recipes and resources. Earlier App lanes actually reran. Original receipts above retain their historical scope; complete phases and release remain unaccepted.
