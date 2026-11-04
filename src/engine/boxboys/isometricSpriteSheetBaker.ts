import * as THREE from 'three';

export interface IsometricBakerConfig {
  frameSize: number;
  directions: number;
  distance: number;
  isometricAngle: number;
}

export interface BakeLayout {
  sheetWidth: number;
  sheetHeight: number;
  columns: number;
  rows: number;
  frames: number;
}

export interface BakeResult {
  albedoTarget: THREE.WebGLRenderTarget;
  normalTarget: THREE.WebGLRenderTarget;
  layout: BakeLayout;
}

export class IsometricSpriteSheetBaker {
  private config: IsometricBakerConfig;
  private camera: THREE.OrthographicCamera;

  constructor(config?: Partial<IsometricBakerConfig>) {
    this.config = {
      frameSize: config?.frameSize ?? 128,
      directions: config?.directions ?? 8,
      distance: config?.distance ?? 100,
      isometricAngle: config?.isometricAngle ?? Math.atan(1 / Math.sqrt(2)),
    };

    const halfSize = this.config.frameSize / 2;
    this.camera = new THREE.OrthographicCamera(
      -halfSize,
      halfSize,
      halfSize,
      -halfSize,
      0.1,
      this.config.distance * 2
    );
  }

  public getConfig(): IsometricBakerConfig {
    return this.config;
  }

  public getLayout(): BakeLayout {
    const frames = this.config.directions;
    let columns = Math.ceil(Math.sqrt(frames));
    let rows = Math.ceil(frames / columns);

    // Fast path for mobile 60fps power-of-two (e.g. 8 frames -> 4x2)
    if (frames === 8) {
      columns = 4;
      rows = 2;
    }

    return {
      sheetWidth: columns * this.config.frameSize,
      sheetHeight: rows * this.config.frameSize,
      columns,
      rows,
      frames
    };
  }

  public getCameraForDirection(dirIndex: number): THREE.OrthographicCamera {
    const yAngle = (dirIndex * Math.PI * 2) / this.config.directions;

    const elevation = Math.sin(this.config.isometricAngle) * this.config.distance;
    const horizontalRadius = Math.cos(this.config.isometricAngle) * this.config.distance;

    const x = Math.sin(yAngle) * horizontalRadius;
    const z = Math.cos(yAngle) * horizontalRadius;

    this.camera.position.set(x, elevation, z);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    return this.camera;
  }

  public bake(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene
  ): BakeResult {
    const layout = this.getLayout();

    // NearestFilter for stylized voxel-box graphics mobile batching
    const renderTargetOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      generateMipmaps: false,
    };

    const albedoTarget = new THREE.WebGLRenderTarget(layout.sheetWidth, layout.sheetHeight, renderTargetOptions);
    const normalTarget = new THREE.WebGLRenderTarget(layout.sheetWidth, layout.sheetHeight, renderTargetOptions);

    const originalClearAlpha = renderer.getClearAlpha();
    const originalClearColor = new THREE.Color();
    renderer.getClearColor(originalClearColor);

    renderer.setClearColor(0x000000, 0);

    const currentRenderTarget = renderer.getRenderTarget();
    const currentAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    const normalMaterial = new THREE.MeshNormalMaterial();

    for (let i = 0; i < layout.frames; i++) {
      const col = i % layout.columns;
      const row = Math.floor(i / layout.columns);

      const x = col * this.config.frameSize;
      const y = (layout.rows - row - 1) * this.config.frameSize;

      const cam = this.getCameraForDirection(i);

      // Render Albedo Pass
      renderer.setRenderTarget(albedoTarget);
      if (i === 0) renderer.clear();
      renderer.setViewport(x, y, this.config.frameSize, this.config.frameSize);
      renderer.setScissor(x, y, this.config.frameSize, this.config.frameSize);
      renderer.setScissorTest(true);
      renderer.render(scene, cam);

      // Render Normal Pass
      renderer.setRenderTarget(normalTarget);
      if (i === 0) renderer.clear();
      const prevOverride = scene.overrideMaterial;
      scene.overrideMaterial = normalMaterial;
      renderer.setViewport(x, y, this.config.frameSize, this.config.frameSize);
      renderer.setScissor(x, y, this.config.frameSize, this.config.frameSize);
      renderer.setScissorTest(true);
      renderer.render(scene, cam);
      scene.overrideMaterial = prevOverride;
    }

    renderer.setScissorTest(false);
    renderer.setRenderTarget(currentRenderTarget);
    renderer.autoClear = currentAutoClear;
    renderer.setClearColor(originalClearColor, originalClearAlpha);

    return {
      albedoTarget,
      normalTarget,
      layout
    };
  }
}
