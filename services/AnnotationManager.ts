import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/Addons.js';
import type { AnnotationData } from '../types';

const STORAGE_KEY = 'bimvision_annotations';

export class AnnotationManager {
    private scene!: THREE.Scene;
    private camera!: THREE.OrthographicCamera | THREE.PerspectiveCamera;
    private labelRenderer!: CSS2DRenderer;
    private container!: HTMLElement;

    private annotations: AnnotationData[] = [];
    private markers: THREE.Object3D[] = [];
    private labels: CSS2DObject[] = [];
    private onAnnotationsChanged?: () => void;

    init(
        scene: THREE.Scene,
        camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
        labelRenderer: CSS2DRenderer,
        container: HTMLElement,
    ) {
        this.scene = scene;
        this.camera = camera;
        this.labelRenderer = labelRenderer;
        this.container = container;
        this.loadFromStorage();
        this.renderAll();
    }

    onChange(callback: () => void) {
        this.onAnnotationsChanged = callback;
    }

    /** Place a new annotation at a world-space position */
    addAnnotation(position: THREE.Vector3, text: string, cameraTarget?: THREE.Vector3): AnnotationData {
        const id = `a_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const data: AnnotationData = {
            id,
            position: { x: position.x, y: position.y, z: position.z },
            text,
            cameraTarget: cameraTarget
                ? { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z }
                : { x: position.x, y: position.y, z: position.z },
            timestamp: Date.now(),
        };

        this.annotations.push(data);
        this.createAnnotationVisual(data);
        this.save();
        this.onAnnotationsChanged?.();
        return data;
    }

    removeAnnotation(id: string) {
        const idx = this.annotations.findIndex(a => a.id === id);
        if (idx === -1) return;

        // Remove visual objects
        const marker = this.markers[idx];
        const label = this.labels[idx];
        if (marker) {
            this.scene.remove(marker);
            if (marker instanceof THREE.Mesh) marker.geometry.dispose();
        }
        if (label) {
            this.scene.remove(label);
            if (label.element) label.element.remove();
        }

        this.annotations.splice(idx, 1);
        this.markers.splice(idx, 1);
        this.labels.splice(idx, 1);
        this.save();
        this.onAnnotationsChanged?.();
    }

    clear() {
        this.markers.forEach(m => {
            this.scene.remove(m);
            if (m instanceof THREE.Mesh) m.geometry.dispose();
        });
        this.labels.forEach(l => {
            this.scene.remove(l);
            l.element?.remove();
        });
        this.annotations = [];
        this.markers = [];
        this.labels = [];
        this.save();
        this.onAnnotationsChanged?.();
    }

    getAnnotations(): AnnotationData[] {
        return [...this.annotations];
    }

    /** Fly camera to annotation */
    focusAnnotation(id: string) {
        const data = this.annotations.find(a => a.id === id);
        if (!data) return;

        const target = new THREE.Vector3(data.cameraTarget.x, data.cameraTarget.y, data.cameraTarget.z);
        // Dispatch custom event for ifcManager to handle
        window.dispatchEvent(new CustomEvent('annotation-focus', {
            detail: { target: { x: target.x, y: target.y, z: target.z } }
        }));
    }

    // --- Internal ---

    private createAnnotationVisual(data: AnnotationData) {
        const pos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);

        // Marker: red pin sphere
        const markerGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const markerMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0x7f1d1d,
            emissiveIntensity: 0.5,
            roughness: 0.4,
            depthTest: true,
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.copy(pos);
        marker.renderOrder = 998;
        marker.userData.annotationId = data.id;
        this.scene.add(marker);
        this.markers.push(marker);

        // Label: CSS2D text
        const div = document.createElement('div');
        div.className = 'annotation-label';
        div.textContent = data.text;
        div.style.cssText = `
            background: rgba(239, 68, 68, 0.92);
            color: #fff;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
            pointer-events: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        `;
        const label = new CSS2DObject(div);
        label.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
        label.userData.annotationId = data.id;
        this.scene.add(label);
        this.labels.push(label);
    }

    private renderAll() {
        this.clearVisuals();
        this.annotations.forEach(a => this.createAnnotationVisual(a));
    }

    private clearVisuals() {
        this.markers.forEach(m => {
            this.scene.remove(m);
            if (m instanceof THREE.Mesh) m.geometry.dispose();
        });
        this.labels.forEach(l => {
            this.scene.remove(l);
            l.element?.remove();
        });
        this.markers = [];
        this.labels = [];
    }

    private save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.annotations));
        } catch {}
    }

    private loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                this.annotations = JSON.parse(raw) as AnnotationData[];
            }
        } catch {}
    }
}
