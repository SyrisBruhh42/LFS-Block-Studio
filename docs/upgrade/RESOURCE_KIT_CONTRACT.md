# Portable resource kits and reviewed placement

Recorded 2026-11-01. This advances P2/P4/P6 against the existing local recipe checkpoint. **P0–P8 and release remain incomplete. Native Minecraft/WorldEdit is NOT_RUN — skipped by user.** No new application dependency, provider, hosting or source publication is involved.

## Complete user journeys

Find actions → Open resource workspace → Review courtyard starter or choose a local kit → inspect definitions, blueprints, license text and notices → Apply reviewed kit import → Library & place → choose a blueprint and exact coordinates/rotation → review exact changed cells → Apply → one Undo → save or download the complete project.

Share a kit selects independent blueprints and/or block definitions. Required definitions and applicable original source notices are included automatically. An editable metadata/license draft and an explicit rights declaration precede the local download. Changing the sharing draft or resource choices revokes that declaration. Project changes require an explicit resource-choice refresh; text drafts remain available. A kit is a reusable resource package, not a whole-project backup, native game export, linked prefab system or executable extension.

The resource workspace uses the same captured Oasis tokens/icons and App preference owner as the menu, cell properties and recipes. Theme, text, minimum control size and motion preferences reach all four surfaces; menu width also sizes resources and recipes. Native modal ownership pauses canvas editing. Native fields, paged resource lists, explicit close/Escape, scrollable notices and focused-control scrolling support keyboard use. Existing catalogue and workshop surfaces remain reachable. The legacy shell is not fully consolidated.

The original **Courtyard starter** contains six block definitions and three independent structures: Pocket garden (57 cells), Reading bench (25) and Garden gateway (21). Its palette and block data have an explicit MIT notice inside the actual archive. It contains no external meshes/images/fonts/scripts; procedural texture names refer to existing renderer capabilities. This notice does not relicense the application, Oasis resources, game assets or unrelated imported content. The first-party kit is Freeform and has no Minecraft bindings or native qualification.

## ZIP and data contract

Studio kit v1 consists of exactly four UTF-8 files:

| File | Content |
|---|---|
| manifest.json | `lfs-studio-kit` version 1, stable descriptive kit ID/name/author, description, declared license/source reference, exact units/axes and bytes/SHA-256 for each payload file |
| resources.json | `lfs-studio-kit-resources` version 1, complete explicit definition list, independent blueprints and flat inherited provenance records |
| LICENSE.txt | The declared package license text, kept as exact UTF-8 text |
| NOTICES.txt | Additional attribution/source notices, kept as exact UTF-8 text |

Units are `studio-studs-plates`: X/Z stud coordinates, Y brick-height coordinates, and definition heights in plates (three per unit). Axes are `x-right-y-up-z-forward`. Unknown units/axes or versions reject; no implicit conversion occurs. MIT, Unlicense and CC0-1.0 are admitted declarations with actual license text. Absence of a license is not the Unlicense. Declaration and hashes do not prove authorship or legal ownership. Source URLs are displayed references, never automatically fetched; credentials and non-HTTP(S) protocols reject.

The ZIP adapter reads ordinary STORE/DEFLATE files, including data descriptors, through a bounded native reader. It writes ordinary STORE ZIPs without a new library. Raw DEFLATE availability is checked at use; an unsupported browser receives a reason. Single-disk central/local records must agree, file names must be safe and unique, local records must be contiguous and nonoverlapping, declared sizes/CRC-32 must agree, and bounded expansion is checked during streaming. ZIP64, encryption, symlinks/nonregular files, alternate path metadata, prefixed/hidden local records, external assets and arbitrary scripts are unsupported. Nothing is extracted to a filesystem or executed.

The implementation references the primary [ZIP format specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) and [WHATWG Compression Standard](https://compression.spec.whatwg.org/) (checked 2026-11-01). No specification text or third-party implementation was copied into the kit.

| Boundary | Current v1 budget |
|---|---|
| Binary archive | 4 MiB, at most 8 ZIP entries at the adapter; kit v1 admits exactly the four named files |
| Expanded data | At most 8 MiB aggregate and 4 MiB per ZIP entry; the JSON resource parser is independently bounded to 4 MiB |
| Resource counts | 256 definitions, 64 blueprints, 10,000 total blueprint cells |
| Rights text | 65,536 UTF-8 bytes each for license and notices; malformed UTF-16 rejects on export instead of replacement |
| Provenance | 32 flat records per kit/project; imported records never recursively embed other archives |
| Recovered original | Versioned base64 source envelope up to 6 MiB, sufficient for every admitted 4 MiB binary archive; canonical base64, declared size and SHA-256 must match |
| Placement review | Complete bounded blueprint and existing document/engine limits; exact report capped at 32 MiB independently of 16 MiB retained history |

These are rejection/work budgets, not heap, latency, browser storage or supported rendering-capacity guarantees. Browser File/Blob/decompression allocations and complete document validation/cloning still exist.

## Closure, provenance and recovery

Every blueprint reference resolves inside the kit. Embedded definitions must match the explicit kit definition of the same ID; no ambient current-project fallback is used. Duplicate identifiers, unsafe/duplicate JSON keys, conflicting anchors, incomplete dependencies and malformed payloads reject before import. The existing complete document schema validates geometry and data; the existing strict resource JSON scanner supplies duplicate-key/depth checks. Its normal 4 MiB allowance remains; the recovery-envelope adapter explicitly requests its separate bounded allowance.

Import adds missing definitions and blueprints and retains exactly matching existing resources. Conflicting IDs reject the complete proposal, including unused definitions. There is no silent replacement or automatic renaming. The project retains full license/notices and associated resource IDs in versioned `extensions.lfsStudioKits` data. This is non-authoritative metadata, not target-policy or permissions authority. Other extension fields survive. Unsupported future provenance rejects import/export while preserving the original project.

Selective re-export includes embedded-only definitions and full dependency closure. Applicable original records retain their texts and archive identity, with resource ID associations scoped to the package. Reimporting a subset unions associations for identical source metadata, preserving prior wider associations. A conflicting source identity or a 33rd record rejects. No provenance pruning or recovery retention policy is introduced.

Before a library edit, the existing persistence hook stages and reads back a separate archival resource project plus a versioned exact original-ZIP source envelope. The active project is not replaced. Public recovery can download that original source; the resource workspace reads the envelope back into the exact original ZIP. It can also download the latest verified original directly. Failed parsing never edits the build; a user-supplied original file remains outside the app. This is not universal arbitrary-record rescue or an independent device-loss backup.

Cancellation/closing before Apply makes no library edit. If archival preservation has already begun, its separate recovery candidate may finish and remain stored; a revoked view cannot subsequently submit the library edit. Failure or uncertainty in preservation blocks Apply and retains the current build. Final history/document/target admission can still reject after successful archival; the preserved original remains recoverable. A repeated exact import with matching notices is a no-op and skips another archive write, preserving source/history/Redo.

## Ownership and placement

`StudioKitModel` owns view/review/job lifecycle only. The mounted `StudioEditorSession` owns all authored library, metadata, placed cells and history. Existing `preserveResourceCandidate` owns original archival. No second store, serializer, world, Undo history or project/policy schema was added.

Draft edits, new input intent (including an early oversized rejection), cancel/close/reopen, source changes and report identity revoke the relevant proposal. A stale or forged report cannot apply or consume a newer report. Late File reads/decoders/exports cannot overwrite a new context. Export downloads are bound to the captured source and draft generation and consumed once. Durable save acknowledgement can advance envelope metadata without changing the authored source token.

Library import changes definitions, blueprints and provenance atomically. It leaves placed cells, session selection/clipboard and game policy unchanged. Unused Freeform kit resources may enter a locked Java project's library; their placement must still pass the existing complete target validator. Imports do not automatically map, substitute, unlock or convert resources.

`prepareStudioPrefabPlacement` uses the current library blueprint, one coherent current document/engine source and existing bounded stamping/identity functions. It reports every added/replaced cell's exact before/after data, retains existing destination IDs, creates fresh new IDs and reveals changed destination chunks in the same proposal. Numeric coordinates may be finite fractional values in Freeform; the target validator independently decides admission. Quarter turns retain saved block appearance/scale semantics; brush mirrors/scale do not alter saved blueprint cells. Shape collision, reflected geometry and state-aware future game transforms are not claimed.

Apply rechecks the expected source and publishes cells/definitions/chunk visibility once through the session; one Undo restores the complete predecessor. A repeated identical placement is a true no-op that retains Redo. Preview does not reserve history/storage. A cell report is an exact change description, not a full project backup or a native WorldEdit script. The small library thumbnail explicitly shows top-view anchors (first 400 if larger); it does not depict height, shape or scale fidelity.

## Evidence and decision boundaries

The current ledger binds each receipt to an actual bundle or source. New domain checks cover archive interoperation with independently produced Python STORE/DEFLATE/data-descriptor fixtures; size/checksum/path/descriptor rejection; exact source rescue; closure/collisions/provenance; complete Undo/Redo; bounded history rejection; draft/read/preservation/export/report identity; locked/unmapped and valid mapped placement.

The actual App resource runner covers 18 journeys using visible controls and actual downloaded bytes. Python standard-library ZIP/CRC/JSON/SHA-256 independently decodes the actual starter and selected kit. The downloaded library summary and accepted placement report are compared with complete project downloads. Public recovery yields the exact ZIP source. Tests include real clipboard use, one Undo/Redo, no-op/Redo, source changes, storage quota failure/retry, a late File read after cancel, selective packaging, fresh-storage resource copy, scoped native Tab at 320 CSS pixels/200% text and locked Java behavior.

Offline evidence is deliberately scoped: a fresh already-loaded App imports a self-contained project and edits/saves with networking disabled. Subsequent reload uses loopback App assets. Service workers are blocked in these fixtures. This proves no remote resource dependency for the named block-native kit; it does not prove PWA offline cold start, update coordination or rollback.

Initial checks reproduced three implementation defects before fixes: malformed UTF-16 could be replaced in raw license text, an early oversized file rejection retained the previous import review, and an old placement completion could update a reopened view's message. Those receipts remain preserved. An initial App test read Undo counts inside a closed disclosure; the fixture was corrected to open it, without changing the assertion or product. Failed/unrun/historical evidence remains separate from final named receipts.

Any missing resource/notices, changed original bytes, silent conflicting-ID overwrite, stale/duplicate Apply, partial library/placement change, lock bypass, no-op Redo loss or invisible focused control invalidates the corresponding gate. Preserve the counterexample and reopen that gate. Green counts, archive hashes and this document do not qualify native games, physical input, assistive technology, provider execution, performance, release or deployment.

Continue source convergence, P1 retention/checkpoint pins/named-copy work, remaining G2 route/stroke/effect coverage and P4 shell/comfort/device accessibility. P6 still needs richer asset intake and linked/versioned prefab semantics, recipe completion/diagnostics and fully qualified offline journeys. P5 precision/repair/conversion, P7 faithful geometry/measured scale and P8 update/rollback/support remain open. Native game runs remain skipped; do not request an installation or run the game.
