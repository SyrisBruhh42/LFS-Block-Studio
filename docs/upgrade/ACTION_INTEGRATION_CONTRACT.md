# Shared editing, target policy and persistence contract

Current source contract, 2026-11-01. The complete `StudioEditorSession` is mounted in App; `studioActions.ts` remains an isolated narrower prototype. This supersedes the old unmounted-session design, preserved in the reference package. **G2 is not fully accepted. The newer App mounts an experimental compatibility review/toggle; integrated enforcement remains unqualified.**

## One authority and separate identities

App reads a single complete authored session through `useSyncExternalStore`. Its transactions cover world metadata, placed blocks, all definitions including edited built-ins, blueprint library, chunks, patterns, optional lighting and bounded opaque metadata. Selection/clipboard participate in session history. Camera, tool preferences, open windows and animated preview clocks do not alter the build. Engine undo stacks are not a second history owner.

| Identity | Meaning |
|---|---|
| documentId | Project identity; recovery/conversion opens a distinct copy |
| editRevision | Monotonic live revision, including Undo/Redo; edit→Undo does not revive an old preview |
| sessionId | Open-session generation; reopening the same project invalidates old work |
| historyEpoch | Policy-compatible undo domain; ordinary Undo cannot cross a target transition |
| durable revision + activationId | IndexedDB comparison token; not the live edit counter |
| typed target policy | Exact schema/policy/profile/mapping/validator/lock identity; opaque extensions are never authority |

Each bounded proposal validates the complete next state before one publication. No-op/rejection publishes no success effects. Composite actions either commit all authored changes once or none. Pre-allocation and loop bounds remain necessary before final validation. Post-commit effects cannot recursively mutate the session. Reversible changed data for both Undo and Redo must fit the documented history allowance before an edit is admitted. See HISTORY_CAPACITY_CONTRACT.md: history preserves the complete logical result through bounded deltas, without serializing the unchanged project into every step.

## Save and replacement handshake

Capture immutable content and live token; save with the expected durable token. Acknowledgement advances durable identity without replacing newer live edits or clearing history. Mark saved only for content actually committed. Different-session callbacks cannot modify a reopened project. Same-document policy/schema/epoch changes are forbidden through ordinary save.

Recovery/import and policy transitions acquire synchronous shared exclusion before asynchronous work. UI inertness alone is insufficient. Staging/readback and final durable compare-and-swap precede live replacement. Failure preserves the prior live state/history and releases exclusion. A changed live token after a committed activation preserves the divergent work and blocks unsafe continuation; it cannot pretend the durable commit did not happen.

## Policy semantics now implemented in the backend

Schema 1 remains readable without implicit rewriting. Schema 2 requires a typed policy; unknown policy versions or identities fail closed. A locked Java document validates the whole placed world against exact captured definition bindings and unit-cell constraints. Unused library content does not become eligible merely because it is stored; its eventual operation must validate. The newer compatibility UI invokes the target transition with exact reviewed-source checks; component evidence does not qualify the full App route.

`StudioDocumentStore.transitionPolicy` verifies unchanged complete authored content, an exact predecessor checkpoint, next durable revision and new epoch. It stages/readbacks the candidate, then atomically compares active authority and source, writes the new revision, rotates activation and promotes the candidate. The old immutable revision remains the checkpoint. Same-project Java transitions only change lock state while preserving identity/mappings. Remapping, version/target changes and incompatible conversions require a separate copy.

`useStudioPersistence.transitionTarget` captures and validates the proposed policy without invoking input getters, preserves current work, excludes concurrent editing, rechecks live identity and installs a committed new session. Compatible lock transitions deliberately start new history. The future UI must review this consequence and bind approval to an exact report/source token. A general-purpose conversion/repair preview is not implemented by this method.

## Resource and job boundaries

Strict blueprint/cloud adapters bound raw input and reject duplicate JSON keys/IDs and unknown fields before maps. Accepted resource originals are verified in a separate recovery candidate before the library transaction. That archival step neither activates the candidate nor marks current edits saved. Cloud snapshots use explicit isolated defaults and restore-as-copy. Provider/runtime qualification remains separate.

Recipes prepare detached bounded results and commit once against their captured session token; cancellation/staleness rejects publication. Current recipe UI does not yet provide a reviewable preview-and-Apply workflow. Copilot proposals, blueprint stamping collisions, all route-specific effects and shared-definition updates still need exact adversarial acceptance.

## Required remaining falsification checks

- Every exposed pointer/form/command/recipe/import/restore/blueprint route attempts forbidden content and preserves complete document/history/effects on rejection.
- Exact preview source includes session, monotonic edit revision, epoch and policy; an intervening edit/undo/reopen invalidates Apply.
- Definition ID conflicts never silently retarget previously placed objects; shared updates preview all affected instances.
- Locked library/tool eligibility matches final document validation; incompatible content remains available in Freeform without bypassing placement rules.
- Project limits distinguish readable, editable, undoable and exportable states; oversized/recovery-only work has a useful independent rescue path.
- Unknown new-namespace schemas/policies retain a bounded raw export path without parsing into or downgrading the live document.
- Retention pins policy checkpoints, originals, active revisions and candidates needed by interrupted work; pagination exposes all preserved recoveries.
- Reviewed compatible transition explains the history boundary; incompatible conversion shows exact losses and creates a distinct project.

Current receipts: 225 contract cases, 20 real policy-store cases, 31 hook/controller cases, 37 modal cases and selected full-App authority/recovery/import journeys. See `IMPLEMENTATION_STATUS.md` for exact candidate names; counts do not constitute complete route acceptance. The gate is a route-to-fixture table with valid, forbidden, stale, cancelled and no-op outcomes, or a visibly disabled route.
