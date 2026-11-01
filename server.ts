import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Server-side Gemini AI Closest-Block Comparison & Schematic Mapper Endpoint
  app.post('/api/ai/block-mapping', async (req, res) => {
    try {
      const { blocks, targetPlatform = 'minecraft_1_20' } = req.body || {};
      if (!Array.isArray(blocks) || blocks.length === 0) {
        return res.status(400).json({ error: 'Missing blocks array in request body.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is not configured. Please check the Settings > Secrets panel.',
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
    console.log(`BrickForge Studio server listening on http://localhost:${PORT}`);
  });
}

startServer();
