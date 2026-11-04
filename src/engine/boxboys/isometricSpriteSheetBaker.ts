import * as THREE from 'three';

export interface BakeResult {
    albedoCanvas: any; // using any to support node environment without DOM types
    normalCanvas: any;
    frames: number;
}

export class IsometricSpriteSheetBaker {
    private resolution: number;

    constructor(resolution: number = 256) {
        this.resolution = resolution;
    }

    public bake(target: THREE.Object3D, renderer: THREE.WebGLRenderer): BakeResult {
        const frames = 8;
        const width = this.resolution * frames;
        const height = this.resolution;

        let albedoCanvas: any = null;
        let normalCanvas: any = null;
        let albedoCtx: any = null;
        let normalCtx: any = null;

        if (typeof document !== 'undefined') {
            albedoCanvas = document.createElement('canvas');
            albedoCanvas.width = width;
            albedoCanvas.height = height;
            albedoCtx = albedoCanvas.getContext('2d');

            normalCanvas = document.createElement('canvas');
            normalCanvas.width = width;
            normalCanvas.height = height;
            normalCtx = normalCanvas.getContext('2d');
        }

        const scene = new THREE.Scene();

        // Clone the target to avoid modifying the original scene
        const bakeTarget = target.clone();
        scene.add(bakeTarget);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);

        const aspect = 1; // 1:1 aspect ratio per frame
        const frustumSize = 2;
        const camera = new THREE.OrthographicCamera(
            (frustumSize * aspect) / -2,
            (frustumSize * aspect) / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1,
            100
        );

        const pitch = Math.atan(1 / Math.SQRT2);
        const distance = 10;
        const y = distance * Math.sin(pitch);
        const xRadius = distance * Math.cos(pitch);

        const normalMaterial = new THREE.MeshNormalMaterial();

        for (let i = 0; i < frames; i++) {
            const angle = (i * Math.PI * 2) / frames;

            camera.position.set(
                Math.sin(angle) * xRadius,
                y,
                Math.cos(angle) * xRadius
            );
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();

            // Render Albedo Pass
            scene.overrideMaterial = null;
            renderer.render(scene, camera);
            if (albedoCtx && renderer.domElement) {
                albedoCtx.drawImage(renderer.domElement, i * this.resolution, 0, this.resolution, this.resolution);
            }

            // Render Normal Pass
            scene.overrideMaterial = normalMaterial;
            renderer.render(scene, camera);
            if (normalCtx && renderer.domElement) {
                normalCtx.drawImage(renderer.domElement, i * this.resolution, 0, this.resolution, this.resolution);
            }
        }

        return {
            albedoCanvas,
            normalCanvas,
            frames
        };
    }
}
