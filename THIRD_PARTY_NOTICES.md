# Third-Party Notices & Clean-Room IP Provenance (`LFS Block Studio`)

## 1. First-Party Original Assets & Courtyard Starter Kit
- All starter blocks, procedural surface patterns, architectural blueprints (`STARTER_STRUCTURE_BLUEPRINTS`), and the bundled Courtyard Starter Resource Kit (`src/lib/studioStarterKit.ts`) are original first-party creations.
- No proprietary textures, meshes, trademarks, or binary assets from Mojang AB (Minecraft), The LEGO Group, Roblox Corporation, or Blizzard Entertainment are included or distributed.

## 2. Open-Source Runtime & Build Dependencies
- **React & React DOM** (`react`, `react-dom`) — MIT License
- **Three.js** (`three`, `@types/three`) — MIT License
- **Lucide Icons** (`lucide-react`) — ISC License
- **Tailwind CSS** (`tailwindcss`, `@tailwindcss/vite`) — MIT License
- **Express** (`express`) — MIT License
- **Firebase JS SDK** (`firebase`) — Apache-2.0 License
- **Google Gen AI SDK** (`@google/genai`) — Apache-2.0 License

## 3. External Format Interoperability Notes
- **Sponge Schematic v3 (`.schem`) & `.mcfunction`**: Generated via clean-room encoders (`src/engine/javaSchematic.ts`, `src/engine/schematicExporter.ts`) for interoperability with external tools. WorldEdit is external software and is not bundled or distributed with this application.
- **glTF 2.0 (`.gltf`), Godot 4 (`.tscn`/`.gd`), and LDraw (`.ldr`)**: Generated as clean-room text/JSON interchange drafts (`src/engine/godotExporter.ts`).
