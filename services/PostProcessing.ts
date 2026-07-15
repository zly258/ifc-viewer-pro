import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';

export class PostProcessingManager {
    private composer!: EffectComposer;
    private renderPass!: RenderPass;
    public outlinePass!: OutlinePass;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private isActive = false;

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.init();
    }

    private init() {
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        const pixelRatio = this.renderer.getPixelRatio();

        const renderTarget = new THREE.WebGLRenderTarget(
            size.x * pixelRatio,
            size.y * pixelRatio,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                samples: 4
            }
        );

        this.composer = new EffectComposer(this.renderer, renderTarget);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        this.outlinePass = new OutlinePass(
            new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio),
            this.scene,
            this.camera
        );

        this.outlinePass.edgeStrength = 4.0;
        this.outlinePass.edgeGlow = 0.4;
        this.outlinePass.edgeThickness = 1.8;
        this.outlinePass.pulsePeriod = 0;
        this.outlinePass.visibleEdgeColor.set('#3b82f6');
        this.outlinePass.hiddenEdgeColor.set('#1d4ed8');

        this.composer.addPass(this.outlinePass);
    }

    public setCamera(camera: THREE.Camera) {
        this.camera = camera;
        this.renderPass.camera = camera;
        this.outlinePass.renderCamera = camera;
    }

    public setSelection(objects: THREE.Object3D[]) {
        this.outlinePass.selectedObjects = objects;
    }

    public handleResize() {
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        const pixelRatio = this.renderer.getPixelRatio();
        this.composer.setSize(size.x, size.y);
        this.outlinePass.setSize(size.x * pixelRatio, size.y * pixelRatio);
    }

    public render() {
        if (this.isActive) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    public setActive(active: boolean) {
        this.isActive = active;
    }

    public get active() {
        return this.isActive;
    }
}
