export interface BBFace {
  uv: [number, number, number, number];
  texture?: number | string | null;
  rotation?: number;
  tint?: number;
  cullface?: string;
  [key: string]: any;
}

export interface BBElementFaces {
  north?: BBFace;
  south?: BBFace;
  east?: BBFace;
  west?: BBFace;
  up?: BBFace;
  down?: BBFace;
  [key: string]: any;
}

export interface BBElement {
  uuid: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  origin: [number, number, number];
  rotation?: [number, number, number];
  faces: BBElementFaces;
  type?: string;
  [key: string]: any;
}

export interface BBOutlinerNode {
  uuid: string;
  name: string;
  origin: [number, number, number];
  rotation?: [number, number, number];
  children: (BBOutlinerNode | string)[];
  [key: string]: any;
}

export interface BBModel {
  meta: {
    format_version: string;
    model_format: string;
    box_uv: boolean;
    [key: string]: any;
  };
  name: string;
  resolution: {
    width: number;
    height: number;
    [key: string]: any;
  };
  elements: BBElement[];
  outliner: (BBOutlinerNode | string)[];
  textures?: any[];
  [key: string]: any;
}

function deterministicReplacer(key: string, value: any) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sortedObj: any = {};
    Object.keys(value).sort().forEach(k => {
      sortedObj[k] = value[k];
    });
    return sortedObj;
  }
  return value;
}

export class BBModelHelper {
  static parse(jsonString: string): BBModel {
    const data = JSON.parse(jsonString);
    if (!data.meta || !data.elements || !data.outliner) {
      throw new Error("Invalid BBModel format: missing meta, elements, or outliner.");
    }
    return data as BBModel;
  }

  static serialize(model: BBModel): string {
    return JSON.stringify(model, deterministicReplacer, 2);
  }
}
