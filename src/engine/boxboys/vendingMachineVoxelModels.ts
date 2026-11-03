export interface Voxel {
    x: number;
    y: number;
    z: number;
    color: string;
}

export type VendingMachineType = 'DrZed' | 'Torgue' | 'Marcus' | 'PackAPunch';

export interface VendingMachineModel {
    type: VendingMachineType;
    voxels: Voxel[];
    dimensions: { width: number; height: number; depth: number };
}

export function generateVendingMachineModel(type: VendingMachineType): VendingMachineModel {
    const voxels: Voxel[] = [];
    const width = 3;
    const height = 5;
    const depth = 2;

    let primaryColor = '#FFFFFF';
    let secondaryColor = '#000000';

    switch (type) {
        case 'DrZed':
            primaryColor = '#E74C3C'; // Red
            secondaryColor = '#FFFFFF'; // White
            break;
        case 'Torgue':
            primaryColor = '#F1C40F'; // Yellow
            secondaryColor = '#2C3E50'; // Dark/Black
            break;
        case 'Marcus':
            primaryColor = '#2ECC71'; // Green
            secondaryColor = '#E67E22'; // Orange
            break;
        case 'PackAPunch':
            primaryColor = '#8E44AD'; // Purple
            secondaryColor = '#F39C12'; // Gold
            break;
    }

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            for (let z = 0; z < depth; z++) {
                const isBorder = x === 0 || x === width - 1 || y === 0 || y === height - 1;
                voxels.push({
                    x,
                    y,
                    z,
                    color: isBorder ? primaryColor : secondaryColor
                });
            }
        }
    }

    return {
        type,
        voxels,
        dimensions: { width, height, depth }
    };
}
