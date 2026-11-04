import { MicroVoxel } from '../types.js';

export interface RelicIcon {
  id: string;
  name: string;
  voxels: MicroVoxel[];
}

const generateSymmetricIcon = (seedStr: string, baseColor: string, accentColor: string): MicroVoxel[] => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const voxels: MicroVoxel[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const val = Math.abs(Math.sin(hash++)) * 10;
      let type = ' ';
      if (val > 8) type = 'C';
      else if (val > 5) type = 'A';
      else if (val > 2) type = 'B';
      
      const addVoxel = (vx: number, vy: number, char: string) => {
        if (char === 'B') {
          voxels.push({ x: vx, y: vy, z: 0, color: baseColor });
        } else if (char === 'A') {
          voxels.push({ x: vx, y: vy, z: 0, color: baseColor });
          voxels.push({ x: vx, y: vy, z: 1, color: accentColor });
        } else if (char === 'C') {
          voxels.push({ x: vx, y: vy, z: 0, color: baseColor });
          voxels.push({ x: vx, y: vy, z: 1, color: accentColor });
          voxels.push({ x: vx, y: vy, z: 2, color: '#ffffff' });
        }
      };

      addVoxel(x, y, type);
      addVoxel(7 - x, y, type); // mirror X
    }
  }
  return voxels;
};

const items = [
  { name: "Soldier's Syringe", base: "#555555", accent: "#F5E97E" },
  { name: "Tougher Times", base: "#333333", accent: "#FFFFFF" },
  { name: "Monster Tooth", base: "#1A4314", accent: "#7FEA39" },
  { name: "Lens-Maker's Glasses", base: "#000000", accent: "#FF0000" },
  { name: "Paul's Goat Hoof", base: "#4E2F1D", accent: "#C19A6B" },
  { name: "Bustling Fungus", base: "#808000", accent: "#00FF00" },
  { name: "Crowbar", base: "#8B0000", accent: "#C0C0C0" },
  { name: "Tri-Tip Dagger", base: "#696969", accent: "#8B0000" },
  { name: "Warbanner", base: "#B8860B", accent: "#FFD700" },
  { name: "Cautious Slug", base: "#4B0082", accent: "#00FFFF" },
  { name: "Personal Shield Generator", base: "#4682B4", accent: "#000080" },
  { name: "Medkit", base: "#2E8B57", accent: "#00FF00" },
  { name: "Gasoline", base: "#B22222", accent: "#FF4500" },
  { name: "Stun Grenade", base: "#A9A9A9", accent: "#FFA500" },
  { name: "Bundle of Fireworks", base: "#FFD700", accent: "#FF4500" },
  { name: "Energy Drink", base: "#00CED1", accent: "#FFD700" },
  { name: "Backup Magazine", base: "#2F4F4F", accent: "#00BFFF" },
  { name: "Sticky Bomb", base: "#FFA500", accent: "#FFFF00" },
  { name: "Rusted Key", base: "#8B4513", accent: "#D2691E" },
  { name: "Armor-Piercing Rounds", base: "#556B2F", accent: "#BDB76B" },
  { name: "Topaz Brooch", base: "#DAA520", accent: "#FFD700" },
  { name: "Focus Crystal", base: "#800080", accent: "#FF00FF" },
  { name: "Bison Steak", base: "#8B0000", accent: "#CD5C5C" },
  { name: "Repulsion Armor Plate", base: "#696969", accent: "#A9A9A9" },
  { name: "Mocha", base: "#D2B48C", accent: "#8B4513" }
];

export const getRoR2Relics = (): RelicIcon[] => {
  return items.map((item, i) => ({
    id: `ror2_relic_${i + 1}`,
    name: item.name,
    voxels: generateSymmetricIcon(item.name, item.base, item.accent)
  }));
};
