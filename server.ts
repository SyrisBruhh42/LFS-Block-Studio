import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOVEREIGN_FORGE_URL =
  process.env.OASIS_SOVEREIGN_FORGE_URL || 'http://127.0.0.1:19447';

function resolveVaultSecret(secretName: string): {
  value: string | null;
  source: 'env' | 'oasis-vault-file' | 'none';
} {
  const envVal = process.env[secretName];
  if (typeof envVal === 'string' && envVal.trim() && envVal !== 'VAULT_INJECTED_AT_RUNTIME') {
    return { value: envVal.trim(), source: 'env' };
  }
  const vaultPaths = [
    process.env.OASIS_VAULT_FILE || '',
    path.join(process.env.HOME || '$HOME', '.config/lfs-oasis/secrets.json'),
    path.join(process.env.HOME || '$HOME', '.local/share/lfs-oasis/vault/secrets.json'),
  ].filter(Boolean);

  for (const vp of vaultPaths) {
    try {
      if (fs.existsSync(vp)) {
        const raw = JSON.parse(fs.readFileSync(vp, 'utf-8'));
        const candidate = raw?.[secretName] || raw?.secrets?.[secretName];
        if (typeof candidate === 'string' && candidate.trim()) {
          return { value: candidate.trim(), source: 'oasis-vault-file' };
        }
      }
    } catch {
      // Ignore unreadable vault file and continue fallback chain
    }
  }
  return { value: null, source: 'none' };
}

async function trySovereignForgeAnalyzeIssue(payload: {
  userDescription: string;
  circledRegions: unknown[];
  telemetrySnapshot: unknown;
}): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${SOVEREIGN_FORGE_URL}/v1/healer/analyze-issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capsuleId: 'lfs-voxel-sandbox',
        projectId: 'lfs-block-studio',
        ...payload,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (data && typeof data.analysis === 'object' && data.analysis !== null) {
      return data.analysis as Record<string, unknown>;
    }
    if (
      data &&
      (data.status === 'OK' ||
        typeof data.diagnosis_summary === 'string' ||
        typeof data.root_cause === 'string' ||
        typeof data.proposed_remediation === 'string')
    ) {
      return {
        title: String(data.diagnosis_summary || 'Sovereign Forge Healer Diagnosis'),
        severity: String(data.severity || 'P1'),
        domain: String(data.domain || 'RENDERING_ARTIFACT'),
        rootCause: String(data.root_cause || data.diagnosis_summary || 'Identified via Sovereign Forge Healer'),
        visualEvidence: String(data.visual_evidence || 'Inspected via Sovereign Forge telemetry and viewport'),
        suspectedFiles: Array.isArray(data.suspected_files)
          ? data.suspected_files
          : ['src/components/SkyblockViewport.tsx'],
        recommendedCodeFix: String(data.proposed_remediation || 'Apply Sovereign Forge remediation'),
        aiStudioFixPrompt: String(data.proposed_remediation || 'Apply Sovereign Forge remediation'),
        confidence: typeof data.confidence === 'number' ? data.confidence : 92,
        ...data,
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildDeterministicBlockMapping(block: Record<string, unknown>, targetPlatform: string) {
  const id = String(block.id || block.sourceBlockId || 'block_0');
  const name = String(block.name || '').toLowerCase();
  const pattern = String(block.texturePattern || '').toLowerCase();
  const finish = String(block.materialFinish || '').toLowerCase();
  const shape = String(block.shape || 'brick').toLowerCase();

  let target = 'minecraft:stone_bricks';
  if (finish === 'glass') target = 'minecraft:glass';
  else if (finish === 'neon') target = 'minecraft:sea_lantern';
  else if (finish === 'metallic') target = 'minecraft:iron_block';
  else if (pattern.includes('oak') || name.includes('wood') || name.includes('oak')) {
    target = shape === 'slope' ? 'minecraft:oak_stairs' : shape === 'plate' ? 'minecraft:oak_slab' : 'minecraft:oak_planks';
  } else if (pattern.includes('cobble') || name.includes('cobble')) {
    target = 'minecraft:cobblestone';
  } else if (shape === 'cylinder') {
    target = 'minecraft:quartz_pillar';
  } else if (shape === 'plate' || shape === 'tile') {
    target = 'minecraft:smooth_stone_slab';
  } else if (shape === 'slope') {
    target = 'minecraft:stone_brick_stairs';
  }

  return {
    sourceBlockId: id,
    recommendedTargetId: target,
    confidence: 90,
    reasoning: `Mapped ${id} (${shape}/${finish || 'matte'}) for ${targetPlatform} via Sovereign Forge local block mapper.`,
    alternatives: [
      'minecraft:stone_bricks',
      'minecraft:smooth_stone',
      'minecraft:quartz_block',
      'minecraft:iron_block',
    ],
  };
}

async function trySovereignForgeBlockMapping(
  blocks: Record<string, unknown>[],
  targetPlatform: string
): Promise<Record<string, unknown>[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${SOVEREIGN_FORGE_URL}/v1/neural/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capsule_id: 'lfs-block-studio',
        task_domain: 'block_mapping',
        model: 'gemma4:e4b-it-q4_K_M',
        prompt: `Map ${blocks.length} studio blocks to ${targetPlatform}: ${JSON.stringify(blocks)}`,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (Array.isArray(data?.mappings)) {
      return data.mappings as Record<string, unknown>[];
    }
    const rawText = String(data?.text || data?.response || '').trim();
    if (rawText.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // Fall through to deterministic Forge mapping
      }
    }
    return blocks.map((b) => buildDeterministicBlockMapping(b, targetPlatform));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Zero-Trust Oasis Vault Client Config Metadata Endpoint (never leaks raw server secrets)
  app.get('/api/lfs/vault/client-config', (_req, res) => {
    const firebaseKey = resolveVaultSecret('VITE_FIREBASE_API_KEY');
    const geminiKey = resolveVaultSecret('GEMINI_API_KEY');
    return res.json({
      app: 'lfs-block-studio',
      capsuleId: 'lfs-voxel-sandbox',
      zeroTrust: true,
      configured: Boolean(firebaseKey.value || geminiKey.value),
      source: firebaseKey.source !== 'none' ? firebaseKey.source : geminiKey.source,
      sovereignForgeEndpoint: SOVEREIGN_FORGE_URL,
    });
  });

  // Sovereign Forge Asset Library Search Proxy Endpoint
  app.get('/api/assets/library', async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query || {})) {
        if (typeof v === 'string' && v.trim()) {
          params.set(k, v.trim());
        }
      }
      if (!params.has('q')) {
        params.set('q', 'voxel');
      }
      const upstreamUrl = `${SOVEREIGN_FORGE_URL}/v1/assets/search?${params.toString()}`;
      const upstream = await fetch(upstreamUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (upstream.ok) {
        const payload = await upstream.json();
        return res.json(payload);
      }
      return res.json({ ok: true, status: 'offline', results: [] });
    } catch {
      return res.json({ ok: true, status: 'offline', results: [] });
    } finally {
      clearTimeout(timeout);
    }
  });

  // Server-side Multimodal Vision & Sovereign Forge Bug & Issue Analyzer Endpoint
  app.post('/api/ai/analyze-issue', async (req, res) => {
    try {
      const {
        annotatedImageBase64,
        circledRegions = [],
        telemetrySnapshot = {},
        userDescription = '',
      } = req.body || {};

      // Tier 1: Route through Local Sovereign Forge (:19447) first
      const forgeAnalysis = await trySovereignForgeAnalyzeIssue({
        userDescription,
        circledRegions: Array.isArray(circledRegions) ? circledRegions : [],
        telemetrySnapshot,
      });
      if (forgeAnalysis) {
        return res.json({
          analysis: forgeAnalysis,
          modelUsed: 'oasis-sovereign-forge-local',
        });
      }

      // Tier 2: Route through Vault/Env Gemini Vision API if configured
      const { value: apiKey } = resolveVaultSecret('GEMINI_API_KEY');
      if (!apiKey) {
        return res.status(503).json({
          error:
            'Local Sovereign Forge (:19447) and GEMINI_API_KEY are offline; client will use deterministic heuristic triage.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const parts: any[] = [];
      if (
        typeof annotatedImageBase64 === 'string' &&
        annotatedImageBase64.length > 64
      ) {
        const cleanedBase64 = annotatedImageBase64.replace(
          /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
          ''
        );
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: cleanedBase64,
          },
        });
      }

      const promptText = `You are a Principal Game QA Architect, WebGL Rendering Auditor, and React/Three.js Systems Engineer inspecting LFS Block Studio.
Analyze the attached viewport screenshot (which may contain red circles, bounding boxes, or numbered pins drawn by the user/tester) alongside the normalized annotation coordinates and live runtime telemetry below.

User/Tester Note:
${userDescription || '(No manual description provided — inspect visual layout, HUD ergonomics, 3D rendering, and telemetry anomalies)'}

Normalized Circled/Highlighted Regions (0..1 relative to viewport width/height):
${JSON.stringify(circledRegions, null, 2)}

Live Studio Telemetry Snapshot:
${JSON.stringify(telemetrySnapshot, null, 2)}

Identify the most critical visual, UX, rendering, persistence, or logic defect shown in the circled area or telemetry, map it to the exact source file in this codebase (e.g. src/components/SkyblockViewport.tsx, src/components/StudioRibbonHeader.tsx, src/components/DraggableWindow.tsx, src/engine/worldEditEngine.ts, src/engine/spatialCopilotEngine.ts, etc.), and generate a ready-to-paste AI Studio self-improvement prompt.`;

      parts.push({ text: promptText });

      const candidateModels = [
        process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-flash-latest',
      ];

      let lastErr: unknown = null;
      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts }],
            config: {
              systemInstruction:
                'Return a structured JSON diagnosis with rootCause, visualEvidence, suspectedFiles, recommendedCodeFix, and a complete ready-to-paste aiStudioFixPrompt.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: 'Concise technical title of the detected issue.',
                  },
                  severity: {
                    type: Type.STRING,
                    description: 'P0, P1, or P2 severity rating.',
                  },
                  domain: {
                    type: Type.STRING,
                    description:
                      'One of: UI_OVERLAP, RENDERING_ARTIFACT, RAYCAST_OCCLUSION, STATE_DESYNC, MEMORY_LEAK, COMMAND_BOUNDS, PERSISTENCE, BALANCE_PROGRESSION, IP_COMPLIANCE.',
                  },
                  rootCause: {
                    type: Type.STRING,
                    description: 'Technical root cause explanation.',
                  },
                  visualEvidence: {
                    type: Type.STRING,
                    description:
                      'Specific visual evidence observed inside the red circled/annotated regions or viewport.',
                  },
                  suspectedFiles: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Array of source file paths in the repository.',
                  },
                  recommendedCodeFix: {
                    type: Type.STRING,
                    description: 'Concrete code-level fix instructions.',
                  },
                  aiStudioFixPrompt: {
                    type: Type.STRING,
                    description:
                      'Self-contained, copy-pasteable prompt for AI Studio Build to fix and regression-test this issue.',
                  },
                  confidence: {
                    type: Type.INTEGER,
                    description: 'Confidence score from 1 to 100.',
                  },
                },
                required: [
                  'title',
                  'severity',
                  'domain',
                  'rootCause',
                  'visualEvidence',
                  'suspectedFiles',
                  'recommendedCodeFix',
                  'aiStudioFixPrompt',
                  'confidence',
                ],
              },
            },
          });

          const text = (response.text ?? '{}').trim();
          const analysis = JSON.parse(text);
          return res.json({ analysis, modelUsed: modelName });
        } catch (err) {
          lastErr = err;
        }
      }

      throw lastErr || new Error('All Gemini vision model candidates failed.');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to analyze visual issue.';
      console.error('Analyze-issue error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // Server-side Closest-Block Comparison & Schematic Mapper Endpoint
  app.post('/api/ai/block-mapping', async (req, res) => {
    try {
      const { blocks, targetPlatform = 'minecraft_1_20' } = req.body || {};
      if (!Array.isArray(blocks) || blocks.length === 0) {
        return res.status(400).json({ error: 'Missing blocks array in request body.' });
      }

      // Tier 1: Route through Local Sovereign Forge (:19447/v1/neural/infer) first
      const forgeMappings = await trySovereignForgeBlockMapping(
        blocks as Record<string, unknown>[],
        String(targetPlatform)
      );
      if (forgeMappings && forgeMappings.length > 0) {
        return res.json({
          mappings: forgeMappings,
          modelUsed: 'oasis-sovereign-forge-local',
        });
      }

      // Tier 2: Route through Vault/Env Gemini API if configured, else deterministic local mapper
      const { value: apiKey } = resolveVaultSecret('GEMINI_API_KEY');
      if (!apiKey) {
        const localMappings = (blocks as Record<string, unknown>[]).map((b) =>
          buildDeterministicBlockMapping(b, String(targetPlatform))
        );
        return res.json({
          mappings: localMappings,
          modelUsed: 'tier0-deterministic-local',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `You are an expert Minecraft WorldEdit, Litematica, and 3D Voxel Schematic architect.
Evaluate the following blocks from our 3D building studio and determine the closest matching target block IDs for platform "${targetPlatform}" (e.g. standard Minecraft Java 1.20+ block IDs like "minecraft:stone_bricks", "minecraft:oak_planks", "minecraft:cobblestone", "minecraft:mossy_stone_bricks", "minecraft:quartz_pillar", "minecraft:sea_lantern", "minecraft:glass", "minecraft:cut_sandstone_slab", "minecraft:oak_stairs", "minecraft:red_concrete", "minecraft:gold_block", "minecraft:iron_block", etc.).

Consider each block's:
- name
- hex color
- shape (brick = full cube, plate/tile = slab, slope = stairs, arch = stairs/wall, cylinder = pillar/log, micro_voxel = chiseled/detailed block)
- texturePattern (smooth_abs, cobblestone, oak_planks, tech_panel, checker_tile, brick_masonry)
- materialFinish (plastic, matte, metallic, glass, neon)

Input blocks to evaluate:
${JSON.stringify(blocks, null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'Return a precise JSON array mapping each input block id to its closest Minecraft block ID, a similarity confidence score (0-100), a short 1-sentence reason, and 4 close alternative block IDs.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sourceBlockId: {
                  type: Type.STRING,
                  description: 'The id of the source block from the input list.',
                },
                recommendedTargetId: {
                  type: Type.STRING,
                  description:
                    'Closest matching target block ID (e.g. minecraft:stone_bricks).',
                },
                confidence: {
                  type: Type.INTEGER,
                  description: 'Match confidence percentage from 1 to 100.',
                },
                reasoning: {
                  type: Type.STRING,
                  description:
                    'Short 1-sentence explanation of why this block matches color, shape, and material.',
                },
                alternatives: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                  },
                  description: 'Up to 4 alternative valid block IDs.',
                },
              },
              required: [
                'sourceBlockId',
                'recommendedTargetId',
                'confidence',
                'reasoning',
                'alternatives',
              ],
            },
          },
        },
      });

      const jsonText = (response.text ?? '[]').trim();
      const mappings = JSON.parse(jsonText);
      return res.json({ mappings });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to evaluate block mappings.';
      console.error('Gemini block-mapping error:', message);
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LFS Block Studio server listening on http://localhost:${PORT}`);
  });
}

startServer();
