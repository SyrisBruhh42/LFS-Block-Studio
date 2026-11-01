import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BlueprintPrefab,
  CollaboratorPresence,
  CustomBlockDefinition,
  PlacedBlock,
} from '../engine/types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const googleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleProvider.addScope(scope);
}

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the OAuth access token in memory only (never in localStorage/sessionStorage).
let cachedAccessToken: string | null = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure(user);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure(null);
    }
  });
};

export async function googleSignIn(): Promise<{ user: User; accessToken: string } | null> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export async function signInWithGoogle(): Promise<User> {
  const res = await googleSignIn();
  if (!res) throw new Error('Google Sign-In was cancelled.');
  return res.user;
}

export async function getAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
  cachedAccessToken = null;
}

export const logout = signOutUser;

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
    }
    callback(user);
  });
}

export function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'doc_1';
}

export interface CloudWorldSummary {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  roomCode: string;
  isPublic: boolean;
  blockCount: number;
  blocksData: string;
  customBlocksData: string;
}

export async function saveWorldToCloud(params: {
  worldId: string;
  name: string;
  roomCode: string;
  isPublic: boolean;
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to save cloud worlds.');

  const safeId = sanitizeId(params.worldId);
  const path = `worlds/${safeId}`;
  const docRef = doc(db, 'worlds', safeId);

  const customList = Object.values(params.customBlocks).filter((d) => d.isCustom);
  const blocksJson = JSON.stringify(params.blocks).slice(0, 495000);
  const customJson = JSON.stringify(customList).slice(0, 195000);
  const blockCount = Math.min(50000, Object.keys(params.blocks).length);
  const safeName = (params.name.trim() || 'Skyblock Island').slice(0, 80);
  const safeOwnerName = (user.displayName || user.email || 'Builder').slice(0, 80);
  const safeRoomCode = sanitizeId(params.roomCode || 'SKY1').slice(0, 16);

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        name: safeName,
        isPublic: Boolean(params.isPublic),
        blocksData: blocksJson,
        customBlocksData: customJson,
        blockCount,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        name: safeName,
        ownerId: user.uid,
        ownerName: safeOwnerName,
        roomCode: safeRoomCode,
        isPublic: Boolean(params.isPublic),
        blocksData: blocksJson,
        customBlocksData: customJson,
        blockCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return safeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listUserAndPublicWorlds(): Promise<CloudWorldSummary[]> {
  const user = auth.currentUser;
  const results: Map<string, CloudWorldSummary> = new Map();

  try {
    const pubQ = query(
      collection(db, 'worlds'),
      where('isPublic', '==', true),
      limit(20)
    );
    const pubSnap = await getDocs(pubQ);
    pubSnap.forEach((d) => {
      const data = d.data();
      results.set(d.id, {
        id: d.id,
        name: data.name,
        ownerId: data.ownerId,
        ownerName: data.ownerName,
        roomCode: data.roomCode,
        isPublic: data.isPublic,
        blockCount: data.blockCount,
        blocksData: data.blocksData,
        customBlocksData: data.customBlocksData,
      });
    });

    if (user) {
      const ownQ = query(
        collection(db, 'worlds'),
        where('ownerId', '==', user.uid),
        limit(20)
      );
      const ownSnap = await getDocs(ownQ);
      ownSnap.forEach((d) => {
        const data = d.data();
        results.set(d.id, {
          id: d.id,
          name: data.name,
          ownerId: data.ownerId,
          ownerName: data.ownerName,
          roomCode: data.roomCode,
          isPublic: data.isPublic,
          blockCount: data.blockCount,
          blocksData: data.blocksData,
          customBlocksData: data.customBlocksData,
        });
      });
    }
    return Array.from(results.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'worlds');
  }
}

export function subscribeToWorldRoom(
  worldId: string,
  onUpdate: (summary: CloudWorldSummary) => void
): () => void {
  const safeId = sanitizeId(worldId);
  const path = `worlds/${safeId}`;
  return onSnapshot(
    doc(db, 'worlds', safeId),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onUpdate({
        id: snap.id,
        name: data.name,
        ownerId: data.ownerId,
        ownerName: data.ownerName,
        roomCode: data.roomCode,
        isPublic: data.isPublic,
        blockCount: data.blockCount,
        blocksData: data.blocksData,
        customBlocksData: data.customBlocksData,
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function updateCollaboratorPresence(
  worldId: string,
  cursor: { x: number; y: number; z: number },
  activeTool: string,
  color: string,
  isWorldPublic: boolean
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const safeWorldId = sanitizeId(worldId);
  const path = `worlds/${safeWorldId}/presence/${user.uid}`;
  try {
    await setDoc(doc(db, 'worlds', safeWorldId, 'presence', user.uid), {
      userId: user.uid,
      userName: (user.displayName || user.email || 'Builder').slice(0, 80),
      color: color.slice(0, 16),
      cursorX: Math.max(-512, Math.min(512, Math.round(cursor.x))),
      cursorY: Math.max(-512, Math.min(512, Math.round(cursor.y))),
      cursorZ: Math.max(-512, Math.min(512, Math.round(cursor.z))),
      activeTool: activeTool.slice(0, 32),
      isWorldPublic: Boolean(isWorldPublic),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToWorldPresence(
  worldId: string,
  onPresenceList: (list: CollaboratorPresence[]) => void
): () => void {
  const safeWorldId = sanitizeId(worldId);
  const path = `worlds/${safeWorldId}/presence`;
  const q = query(
    collection(db, 'worlds', safeWorldId, 'presence'),
    where('isWorldPublic', '==', true)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CollaboratorPresence[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.userId !== auth.currentUser?.uid) {
          list.push({
            userId: data.userId,
            userName: data.userName,
            color: data.color,
            cursorX: data.cursorX,
            cursorY: data.cursorY,
            cursorZ: data.cursorZ,
            activeTool: data.activeTool,
            isWorldPublic: data.isWorldPublic,
          });
        }
      });
      onPresenceList(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveBlueprintToCloud(bp: BlueprintPrefab): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to save blueprints to Firebase Cloud.');

  const safeId = sanitizeId(bp.id);
  const path = `blueprints/${safeId}`;
  const docRef = doc(db, 'blueprints', safeId);

  const payloadStr = JSON.stringify({
    blocks: bp.blocks,
    customBlockDefs: bp.customBlockDefs,
  }).slice(0, 295000);

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await updateDoc(docRef, {
        name: bp.name.slice(0, 80),
        description: bp.description.slice(0, 300),
        isPublic: Boolean(bp.isPublic),
        blockCount: Math.max(1, Math.min(25000, bp.blocks.length)),
        sizeX: Math.max(1, Math.min(256, bp.size.lx)),
        sizeY: Math.max(1, Math.min(256, bp.size.ly)),
        sizeZ: Math.max(1, Math.min(256, bp.size.lz)),
        payload: payloadStr,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        name: bp.name.slice(0, 80),
        description: bp.description.slice(0, 300),
        authorId: user.uid,
        authorName: (user.displayName || user.email || 'Builder').slice(0, 80),
        blueprintType: bp.blueprintType,
        isPublic: Boolean(bp.isPublic),
        blockCount: Math.max(1, Math.min(25000, bp.blocks.length)),
        sizeX: Math.max(1, Math.min(256, bp.size.lx)),
        sizeY: Math.max(1, Math.min(256, bp.size.ly)),
        sizeZ: Math.max(1, Math.min(256, bp.size.lz)),
        payload: payloadStr,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCloudBlueprints(): Promise<BlueprintPrefab[]> {
  const user = auth.currentUser;
  const map = new Map<string, BlueprintPrefab>();

  try {
    const pubQ = query(
      collection(db, 'blueprints'),
      where('isPublic', '==', true),
      limit(30)
    );
    const pubSnap = await getDocs(pubQ);
    pubSnap.forEach((d) => {
      const data = d.data();
      try {
        const parsed = JSON.parse(data.payload);
        map.set(d.id, {
          id: d.id,
          name: data.name,
          description: data.description,
          authorId: data.authorId,
          authorName: data.authorName,
          blueprintType: data.blueprintType,
          isPublic: data.isPublic,
          size: { lx: data.sizeX, ly: data.sizeY, lz: data.sizeZ },
          blocks: parsed.blocks || [],
          customBlockDefs: parsed.customBlockDefs || [],
          createdAt: new Date().toISOString(),
        });
      } catch {
        // Ignore malformed payload
      }
    });

    if (user) {
      const ownQ = query(
        collection(db, 'blueprints'),
        where('authorId', '==', user.uid),
        limit(30)
      );
      const ownSnap = await getDocs(ownQ);
      ownSnap.forEach((d) => {
        const data = d.data();
        try {
          const parsed = JSON.parse(data.payload);
          map.set(d.id, {
            id: d.id,
            name: data.name,
            description: data.description,
            authorId: data.authorId,
            authorName: data.authorName,
            blueprintType: data.blueprintType,
            isPublic: data.isPublic,
            size: { lx: data.sizeX, ly: data.sizeY, lz: data.sizeZ },
            blocks: parsed.blocks || [],
            customBlockDefs: parsed.customBlockDefs || [],
            createdAt: new Date().toISOString(),
          });
        } catch {
          // Ignore malformed payload
        }
      });
    }
    return Array.from(map.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'blueprints');
  }
}

export async function deleteCloudBlueprint(blueprintId: string): Promise<void> {
  const safeId = sanitizeId(blueprintId);
  const path = `blueprints/${safeId}`;
  try {
    await deleteDoc(doc(db, 'blueprints', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Apple App Store Guideline 5.1.1(v) & Google Play Data Safety Compliance:
 * Permanently deletes all cloud worlds and blueprints owned by the signed-in user
 * and revokes the active session.
 */
export async function deleteAllUserCloudData(): Promise<{
  deletedWorlds: number;
  deletedBlueprints: number;
}> {
  const user = auth.currentUser;
  if (!user) {
    return { deletedWorlds: 0, deletedBlueprints: 0 };
  }

  let deletedWorlds = 0;
  let deletedBlueprints = 0;

  try {
    const ownWorldsQ = query(
      collection(db, 'worlds'),
      where('ownerId', '==', user.uid),
      limit(50)
    );
    const ownWorldsSnap = await getDocs(ownWorldsQ);
    for (const d of ownWorldsSnap.docs) {
      await deleteDoc(doc(db, 'worlds', d.id));
      deletedWorlds++;
    }

    const ownBpQ = query(
      collection(db, 'blueprints'),
      where('authorId', '==', user.uid),
      limit(50)
    );
    const ownBpSnap = await getDocs(ownBpQ);
    for (const d of ownBpSnap.docs) {
      await deleteDoc(doc(db, 'blueprints', d.id));
      deletedBlueprints++;
    }
  } catch (error) {
    console.warn('Partial cloud purge error:', error);
  }

  await signOutUser();
  return { deletedWorlds, deletedBlueprints };
}

