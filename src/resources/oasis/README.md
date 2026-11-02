# Oasis resources for Block Studio

Captured 2026-11-01 for the user's local design and AI Studio handoff. These are real Oasis resources, not newly invented lookalikes. `source_manifest.json` records source paths, sizes and SHA-256 hashes. The six source copies were read back byte-for-byte after copying.

## What is included

| File | Purpose | Evidence limit |
|---|---|---|
| `lds-tokens.w3c.json` | Semantic colors, typography, spacing, radius, motion, focus and target-size source | Modified local U2 file; metadata assertions are source claims, not independently demonstrated accessibility results |
| `lds-tokens.css` | Existing compiled web variables and theme selectors | Modified local U2 file; includes experimental/extended selectors beyond the four baseline themes |
| `SolarpunkIcon.tsx` | Existing React icon component with named Oasis vector icons | Untracked local U2 file; available source, not a committed or built component |
| `notices/LICENSE`, `notices/LEGAL.md`, `notices/CREDITS.md` | Unmodified suite ownership and third-party notices | Root `NOTICE`, `DISCLAIMERS.md` and `GOODWILL-CHARTER.md` were not present; no replacement notices invented |
| `block-studio-lds-adapter.css` | New proposed mapping from LDS variables to Block Studio chrome | Handoff code, not installed or browser-qualified |

The suite root is not itself a Git repository. The U2 repository HEAD is `93705fc18eb028b818f4afde5071d1db22b32393`; that commit does **not** identify the bytes of these modified/untracked resources. Use their individual hashes for this snapshot.

## Rights boundary

Oasis first-party resources are **proprietary source-available**, not MIT or Unlicense. Their local reuse here follows the user's express request to pull resources from their Oasis project; this package does not change ownership, license, or external redistribution rights. Preserve the supplied notices. Third-party components retain their own licenses. No source was uploaded to a provider or public repository during this work.

## Integration contract

1. Keep Block Studio's React + Vite architecture. Do not import Oasis's Next.js provider or server architecture just to obtain a theme.
2. Import the copied generated CSS before the proposed adapter in a standalone Block Studio build. Set `data-lds-theme` on the document element to one of `evergreen-dark`, `evergreen-light`, `high-contrast`, `calm`. Keep these IDs stable. Do not enable `data-abac-solarpunk` or circadian attributes as part of the first slice.
3. If embedding inside Oasis, inherit the host's LDS variables and do not inject a second global `:root` stylesheet. Scope the adapter to the studio root. One host owns theme selection.
4. Appearance applies to menus, panels, forms and focus states. Do not recolor authored materials, exported files or the 3D scene when users change the interface theme.
5. The user-confirmed primary toggle is **Game compatibility lock**: constrain blocks, tools, commands and exports to a selected game/edition/version profile. Theme, any optional Simple/Professional presentation depth, and Oasis `View / Edit / Build` workflow state are separate controls. None is an authorization grant. No mode switch may silently execute code, change provider access or synchronize a project.
6. Source `48dp` is an Android design token, not a valid CSS length. The proposed web adapter deliberately uses a minimum 48px on coarse pointers. Preserve the original resource and correct its use at the web boundary.
7. Font stacks name Inter/Noto Sans and JetBrains Mono/Fira Code. These copies do not include font binaries. Use system fallbacks first; any later bundled font needs its own license, and do not add remote font requests implicitly.
8. `SolarpunkIcon` hides SVGs from assistive technology. Give buttons visible text or an accessible name. Unknown icon IDs fall back to the ABAC node icon, so keep a checked mapping and test it. Do not confuse the component's optional `preserveSrEmoji` with a requirement for emoji in chrome.
9. Test keyboard focus, text zoom, contrast of actual adjacent surfaces, reduced motion, touch targets and all four themes. The token metadata's claims of resolved conflicts are not substitute test results.

Oasis's Wave 6H document was consulted only for interaction intent (persistent stage, searchable tools, recoverable workspaces, optional comfort). Its exact latency, zero-cost and 100%/sigma claims were not reproduced or adopted as acceptance evidence. This handoff does not implement or release that larger specification.
