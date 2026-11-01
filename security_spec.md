# Firestore Security Specification — BrickForge Studio

## 1. Data Invariants
1. **Identity & Email Verification**: All standard writes require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
2. **Ownership Integrity**:
   - A `WorldDocument` at `/worlds/{worldId}` must have `ownerId == request.auth.uid` on creation, and `ownerId` + `createdAt` are strictly immutable on update.
   - A `BlueprintDocument` at `/blueprints/{blueprintId}` must have `authorId == request.auth.uid` on creation, and `authorId` + `createdAt` are strictly immutable on update.
   - A `PresenceDocument` at `/worlds/{worldId}/presence/{userId}` can only be written by the user matching `{userId}` (`userId == request.auth.uid`) and only if the parent `/worlds/{worldId}` document exists (`exists(...)`) and is either owned by the user or marked `isPublic == true`.
3. **Query Enforcement (No Blanket Reads)**:
   - `list` queries on `/worlds` and `/blueprints` must restrict access via `resource.data` (`resource.data.ownerId == request.auth.uid || resource.data.isPublic == true` for worlds; `resource.data.authorId == request.auth.uid || resource.data.isPublic == true` for blueprints).
4. **Strict Key & Size Enforcement**:
   - Every create and update enforces `hasAll` / `hasOnly` and `affectedKeys().hasOnly(...)` along with string `.size()` bounds and `request.time` timestamp validation.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on World Create**: Includes `isAdmin: true` alongside required fields -> Rejected by `data.keys().hasOnly(...)`.
2. **Owner Spoofing on Blueprint Create**: Sets `authorId: "victim-uid"` -> Rejected by `data.authorId == request.auth.uid`.
3. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create a blueprint -> Rejected by `isVerifiedUser()`.
4. **Immortal Field Mutation on World Update**: Attempts to change `ownerId` or `createdAt` -> Rejected by immutability checks and `affectedKeys().hasOnly(...)`.
5. **Client Timestamp Forgery**: Sends a backdated `createdAt` or `updatedAt` timestamp -> Rejected by `incoming().createdAt == request.time` / `incoming().updatedAt == request.time`.
6. **Denial-of-Wallet Oversized String**: Sends a 1MB string in `name` -> Rejected by `data.name.size() <= 80`.
7. **ID Poisoning Attack**: Uses invalid characters or >128 char document ID -> Rejected by `isValidId(docId)`.
8. **Orphaned Presence Write**: Writes to `/worlds/nonexistent/presence/uid` -> Rejected by Master Gate `exists(/databases/$(database)/documents/worlds/$(worldId))`.
9. **Unauthorized Private World Co-Build**: Non-owner attempts to update `blocksData` on a world with `isPublic == false` -> Rejected by tiered update logic.
10. **Unauthorized Private Blueprint Read**: Non-author attempts `get` or `list` on a blueprint with `isPublic == false` -> Rejected by `resource.data.authorId == request.auth.uid || resource.data.isPublic == true`.
11. **Invalid Enum on Blueprint Type**: Sets `blueprintType: "malicious_type"` -> Rejected by `data.blueprintType in ['custom_block', 'structure_blueprint']`.
12. **Cross-User Presence Hijack**: User A attempts to update `/worlds/{worldId}/presence/{userB}` -> Rejected by `userId == request.auth.uid`.
