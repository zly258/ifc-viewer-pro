import * as THREE from 'three';
import { ifcManager } from './ifcManager';
import { ViewerTool } from '../types';
import { eventBus } from './eventBus';

export interface BcfViewpoint {
    id: string;
    title: string;
    comment: string;
    modelKey?: string;   // Stable model identifier (file name) this annotation belongs to
    modelID?: number;
    expressID?: number;
    guid?: string;
    cameraPosition: [number, number, number];
    cameraTarget: [number, number, number];
    cameraZoom: number;
    cameraYaw?: number;
    cameraPitch?: number;
    screenshot: string; // Base64 data URL
    clippingPlanes?: { axis: 'X' | 'Y' | 'Z', min: number, max: number }[];
    timestamp: number;
}

const STORAGE_KEY = 'bimvision_bcf_viewpoints_v2';
const LEGACY_STORAGE_KEY = 'bimvision_bcf_viewpoints';
const LEGACY_MODEL_KEY = '__legacy__';

class BcfManager {
    // Annotations grouped by stable model key (file name). This is what makes
    // annotations MODEL-ASSOCIATED: loading a different model only shows that
    // model's annotations instead of one global pile.
    private store: Map<string, BcfViewpoint[]> = new Map();
    public onViewpointsChange: (vps: BcfViewpoint[]) => void = () => {};

    constructor() {
        this.loadFromStorage();

        // Refresh the panel whenever the loaded model set changes so it always
        // reflects the annotations of the currently-loaded model(s).
        eventBus.on('models-changed', () => {
            this.onViewpointsChange(this.getViewpoints());
        });
    }

    // Stable keys of all currently-loaded models (their file names).
    private getCurrentModelKeys(): string[] {
        const keys: string[] = [];
        ifcManager.models.forEach((m) => {
            if (m.name && !keys.includes(m.name)) keys.push(m.name);
        });
        return keys;
    }

    // The "primary" model key used when an annotation has no explicitly linked
    // element (falls back to the first loaded model).
    private getPrimaryModelKey(): string | null {
        const keys = this.getCurrentModelKeys();
        return keys.length > 0 ? keys[0] : null;
    }

    // Resolve the model key for a captured viewpoint from its linked element,
    // falling back to the primary loaded model.
    private resolveModelKey(selectedElement: any | null): string | null {
        if (selectedElement && selectedElement.modelID !== undefined) {
            const rec = ifcManager.models.get(selectedElement.modelID);
            if (rec?.name) return rec.name;
        }
        return this.getPrimaryModelKey();
    }

    // Returns only the annotations belonging to the currently-loaded model(s),
    // newest first. If no model is loaded, returns an empty list.
    getViewpoints(): BcfViewpoint[] {
        const keys = this.getCurrentModelKeys();
        const result: BcfViewpoint[] = [];
        keys.forEach((k) => {
            const group = this.store.get(k);
            if (group) result.push(...group);
        });
        // Also surface legacy (pre-migration) annotations so they aren't lost.
        const legacy = this.store.get(LEGACY_MODEL_KEY);
        if (legacy) result.push(...legacy);
        return result.sort((a, b) => b.timestamp - a.timestamp);
    }

    captureViewpoint(title: string, comment: string, selectedElement: any | null): BcfViewpoint | null {
        const renderer = (ifcManager as any).renderer as THREE.WebGLRenderer;
        if (!renderer) return null;

        // Annotations must belong to a model. Refuse to capture on an empty scene.
        const modelKey = this.resolveModelKey(selectedElement);
        if (!modelKey) return null;

        // 1. Take viewport screenshot
        let screenshot = '';
        try {
            // Render one frame immediately to ensure buffer is ready
            const labelRenderer = (ifcManager as any).labelRenderer;
            renderer.render((ifcManager as any).scene, ifcManager.camera);
            if (labelRenderer) {
                labelRenderer.render((ifcManager as any).scene, ifcManager.camera);
            }
            screenshot = renderer.domElement.toDataURL('image/png');
        } catch (e) {
            console.warn("Screenshot capture failed", e);
        }

        // 2. Read camera state
        const cameraPos: [number, number, number] = [
            ifcManager.camera.position.x,
            ifcManager.camera.position.y,
            ifcManager.camera.position.z
        ];
        const cameraTarget: [number, number, number] = [
            (ifcManager as any).controls.target.x,
            (ifcManager as any).controls.target.y,
            (ifcManager as any).controls.target.z
        ];
        const cameraZoom = ifcManager.camera.zoom || 1;
        const cameraYaw = (ifcManager as any).cameraYaw;
        const cameraPitch = (ifcManager as any).cameraPitch;

        // 3. Extract element GUID and properties
        let guid = undefined;
        if (selectedElement && selectedElement.properties) {
            const guidProp = selectedElement.properties.find((p: any) => p.name === '全局唯一标识 (GUID)' || p.name === 'GlobalId');
            if (guidProp) guid = String(guidProp.value);
        }

        // 4. Capture active clipping planes
        const clippingPlanes: { axis: 'X' | 'Y' | 'Z', min: number, max: number }[] = [];
        if (ifcManager.sectionManager) {
            const sm = ifcManager.sectionManager as any;
            const activeAxes = sm.activeAxis as Set<'X' | 'Y' | 'Z'>;
            activeAxes.forEach(axis => {
                let min = 0;
                let max = 0;
                if (axis === 'X') {
                    min = -sm.planes.xMin.constant;
                    max = sm.planes.xMax.constant;
                } else if (axis === 'Y') {
                    min = -sm.planes.yMin.constant;
                    max = sm.planes.yMax.constant;
                } else if (axis === 'Z') {
                    min = -sm.planes.zMin.constant;
                    max = sm.planes.zMax.constant;
                }
                clippingPlanes.push({ axis, min, max });
            });
        }

        const group = this.store.get(modelKey) || [];
        const newVp: BcfViewpoint = {
            id: `vp_${Date.now()}`,
            title: title || `批注 #${group.length + 1}`,
            comment: comment || '无描述',
            modelKey,
            modelID: selectedElement?.modelID,
            expressID: selectedElement?.expressID,
            guid,
            cameraPosition: cameraPos,
            cameraTarget,
            cameraZoom,
            cameraYaw,
            cameraPitch,
            screenshot,
            clippingPlanes: clippingPlanes.length > 0 ? clippingPlanes : undefined,
            timestamp: Date.now()
        };

        group.push(newVp);
        this.store.set(modelKey, group);
        this.saveToStorage();
        this.onViewpointsChange(this.getViewpoints());
        return newVp;
    }

    deleteViewpoint(id: string) {
        // Remove from whichever model group holds it.
        this.store.forEach((group, key) => {
            const filtered = group.filter(v => v.id !== id);
            if (filtered.length !== group.length) {
                if (filtered.length === 0) this.store.delete(key);
                else this.store.set(key, filtered);
            }
        });
        this.saveToStorage();
        this.onViewpointsChange(this.getViewpoints());
    }

    restoreViewpoint(vp: BcfViewpoint) {
        ifcManager.setTool(ViewerTool.SELECT);

        setTimeout(() => {
            ifcManager.camera.position.set(vp.cameraPosition[0], vp.cameraPosition[1], vp.cameraPosition[2]);
            (ifcManager as any).controls.target.set(vp.cameraTarget[0], vp.cameraTarget[1], vp.cameraTarget[2]);
            ifcManager.camera.zoom = vp.cameraZoom || 1;
            ifcManager.camera.updateProjectionMatrix();
            (ifcManager as any).controls.update();
            (ifcManager as any).renderScene();
        }, 50);

        // Restore clipping planes
        if (ifcManager.sectionManager) {
            const sm = ifcManager.sectionManager;
            sm.togglePlane('X', false, 0, 0);
            sm.togglePlane('Y', false, 0, 0);
            sm.togglePlane('Z', false, 0, 0);
            
            if (vp.clippingPlanes) {
                vp.clippingPlanes.forEach(cp => {
                    sm.togglePlane(cp.axis, true, cp.min, cp.max);
                });
            }
        }

        // Highlight element
        if (vp.expressID !== undefined && vp.expressID >= 0 && vp.modelID !== undefined) {
            ifcManager.selectByID(vp.modelID, vp.expressID, true);
        } else {
            ifcManager.clearSelection();
            ifcManager.onSelect(null);
        }
    }

    // Exports only the annotations of the currently-loaded model(s).
    exportToJson(): string {
        return JSON.stringify(this.getViewpoints(), null, 2);
    }

    importFromJson(jsonStr: string): boolean {
        try {
            const data = JSON.parse(jsonStr);
            if (!Array.isArray(data)) return false;

            const primaryKey = this.getPrimaryModelKey();
            const seen = new Set<string>();
            // Snapshot existing ids to avoid duplicates.
            this.store.forEach((group) => group.forEach((v) => seen.add(v.id)));

            (data as BcfViewpoint[]).forEach((vp) => {
                if (!vp || !vp.id || seen.has(vp.id)) return;
                // Route each imported annotation to its own model group, falling
                // back to the primary loaded model (or a legacy bucket).
                const key = vp.modelKey || primaryKey || LEGACY_MODEL_KEY;
                const group = this.store.get(key) || [];
                group.push({ ...vp, modelKey: key });
                this.store.set(key, group);
                seen.add(vp.id);
            });

            this.saveToStorage();
            this.onViewpointsChange(this.getViewpoints());
            return true;
        } catch (e) {
            console.error("BCF Import Failed", e);
            return false;
        }
    }

    // ── Persistence ──
    private loadFromStorage() {
        // 1) Preferred: model-keyed store (v2).
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const obj = JSON.parse(saved) as Record<string, BcfViewpoint[]>;
                this.store = new Map(Object.entries(obj));
            } catch {
                this.store = new Map();
            }
        }

        // 2) One-time migration of the old flat array (pre model-association).
        //    Old records have no reliable model key, so they go into a legacy
        //    bucket that is always shown, then the old key is removed.
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
            try {
                const arr = JSON.parse(legacy) as BcfViewpoint[];
                if (Array.isArray(arr) && arr.length > 0) {
                    const bucket = this.store.get(LEGACY_MODEL_KEY) || [];
                    arr.forEach((v) => bucket.push({ ...v, modelKey: LEGACY_MODEL_KEY }));
                    this.store.set(LEGACY_MODEL_KEY, bucket);
                    this.saveToStorage();
                }
            } catch { /* ignore malformed legacy data */ }
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
    }

    private saveToStorage() {
        const obj: Record<string, BcfViewpoint[]> = {};
        this.store.forEach((group, key) => { obj[key] = group; });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }
}

export const bcfManager = new BcfManager();
