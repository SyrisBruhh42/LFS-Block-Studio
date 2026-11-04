export type BiomeType = 'plains' | 'forest' | 'desert' | 'snow' | 'volcano' | 'cave';

export interface VoxelPBR {
    hexColor: number;
    roughness: number;
    metalness: number;
    normalX: number;
    normalY: number;
    normalZ: number;
}

export interface VoxelTile {
    x: number;
    y: number;
    z: number; // height offset
    type: 'ground' | 'wall' | 'obstacle';
    pbr: VoxelPBR;
}

export interface Room12x12 {
    biome: BiomeType;
    tiles: VoxelTile[][];
}

export class BiomePaletteGenerator {
    private seed: number;

    constructor(seed: number = 0) {
        // Ensure non-zero seed for LCG
        this.seed = seed === 0 ? 1 : seed;
    }

    /**
     * Simple Linear Congruential Generator for pseudo-random deterministic numbers.
     */
    private random(): number {
        // Park-Miller LCG
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }

    public getPalette(biome: BiomeType): Record<'ground' | 'wall' | 'obstacle', VoxelPBR> {
        switch(biome) {
            case 'plains': return {
                ground: { hexColor: 0x4CAF50, roughness: 0.9, metalness: 0.0, normalX: 0, normalY: 1, normalZ: 0 },
                wall: { hexColor: 0x795548, roughness: 0.8, metalness: 0.0, normalX: 0, normalY: 0, normalZ: 1 },
                obstacle: { hexColor: 0x9E9E9E, roughness: 0.7, metalness: 0.1, normalX: 0, normalY: 1, normalZ: 0 },
            };
            case 'forest': return {
                ground: { hexColor: 0x2E7D32, roughness: 1.0, metalness: 0.0, normalX: 0, normalY: 1, normalZ: 0 },
                wall: { hexColor: 0x3E2723, roughness: 0.9, metalness: 0.0, normalX: 0, normalY: 0, normalZ: 1 },
                obstacle: { hexColor: 0x1B5E20, roughness: 0.8, metalness: 0.0, normalX: 0, normalY: 1, normalZ: 0 },
            };
            case 'desert': return {
                ground: { hexColor: 0xE2C275, roughness: 0.9, metalness: 0.0, normalX: 0, normalY: 1, normalZ: 0 },
                wall: { hexColor: 0xC19A6B, roughness: 0.95, metalness: 0.0, normalX: 0, normalY: 0, normalZ: 1 },
                obstacle: { hexColor: 0xEDC9AF, roughness: 0.8, metalness: 0.0, normalX: 0, normalY: 1, normalZ: 0 },
            };
            case 'snow': return {
                ground: { hexColor: 0xFFFAFA, roughness: 0.5, metalness: 0.1, normalX: 0, normalY: 1, normalZ: 0 },
                wall: { hexColor: 0xB0E0E6, roughness: 0.6, metalness: 0.2, normalX: 0, normalY: 0, normalZ: 1 },
                obstacle: { hexColor: 0xE0FFFF, roughness: 0.4, metalness: 0.3, normalX: 0, normalY: 1, normalZ: 0 },
            };
            case 'volcano': return {
                ground: { hexColor: 0x212121, roughness: 0.9, metalness: 0.1, normalX: 0, normalY: 1, normalZ: 0 },
                wall: { hexColor: 0xD84315, roughness: 0.5, metalness: 0.5, normalX: 0, normalY: 0, normalZ: 1 },
                obstacle: { hexColor: 0xBF360C, roughness: 0.6, metalness: 0.4, normalX: 0, normalY: 1, normalZ: 0 },
            };
            case 'cave': return {
                ground: { hexColor: 0x424242, roughness: 0.7, metalness: 0.2, normalX: 0, normalY: 1, normalZ: 0 },
                wall: { hexColor: 0x212121, roughness: 0.8, metalness: 0.3, normalX: 0, normalY: 0, normalZ: 1 },
                obstacle: { hexColor: 0x616161, roughness: 0.6, metalness: 0.5, normalX: 0, normalY: 1, normalZ: 0 },
            };
        }
    }

    public generateRoom(biome: BiomeType): Room12x12 {
        const palette = this.getPalette(biome);
        const tiles: VoxelTile[][] = [];

        for (let y = 0; y < 12; y++) {
            const row: VoxelTile[] = [];
            for (let x = 0; x < 12; x++) {
                let type: 'ground' | 'wall' | 'obstacle' = 'ground';
                let z = 0;

                // Border walls for Elona room layout
                if (x === 0 || x === 11 || y === 0 || y === 11) {
                    type = 'wall';
                    z = 2; // Walls are elevated
                } else {
                    // Random inner obstacles (approx 10% chance)
                    if (this.random() > 0.90) {
                        type = 'obstacle';
                        z = 1;
                    }
                }
                
                // Add micro-variations to PBR to give stylized texture
                const basePbr = palette[type];
                const noise = (this.random() - 0.5) * 0.1;
                const r = Math.max(0, Math.min(1, basePbr.roughness + noise));
                const m = Math.max(0, Math.min(1, basePbr.metalness + noise));

                row.push({
                    x, 
                    y, 
                    z,
                    type,
                    pbr: {
                        hexColor: basePbr.hexColor,
                        roughness: r,
                        metalness: m,
                        normalX: basePbr.normalX,
                        normalY: basePbr.normalY,
                        normalZ: basePbr.normalZ
                    }
                });
            }
            tiles.push(row);
        }

        return {
            biome,
            tiles
        };
    }
}
