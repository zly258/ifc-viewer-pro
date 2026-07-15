import * as THREE from 'three';
import { ifcManager } from './ifcManager';
import { ViewerTool } from '../types';

export interface BcfViewpoint {
    id: string;
    title: string;
    comment: string;
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

class BcfManager {
    private viewpoints: BcfViewpoint[] = [];
    public onViewpointsChange: (vps: BcfViewpoint[]) => void = () => {};

    constructor() {
        // Load viewpoints from localStorage on init
        const saved = localStorage.getItem('bimvision_bcf_viewpoints');
        if (saved) {
            try {
                this.viewpoints = JSON.parse(saved);
            } catch (e) {
                this.viewpoints = [];
            }
        }
    }

    getViewpoints(): BcfViewpoint[] {
        return this.viewpoints;
    }

    captureViewpoint(title: string, comment: string, selectedElement: any | null): BcfViewpoint | null {
        const renderer = (ifcManager as any).renderer as THREE.WebGLRenderer;
        if (!renderer) return null;

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

        const newVp: BcfViewpoint = {
            id: `vp_${Date.now()}`,
            title: title || `视点批注 #${this.viewpoints.length + 1}`,
            comment: comment || '无描述',
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

        this.viewpoints.push(newVp);
        this.saveToStorage();
        this.onViewpointsChange([...this.viewpoints]);
        return newVp;
    }

    deleteViewpoint(id: string) {
        this.viewpoints = this.viewpoints.filter(v => v.id !== id);
        this.saveToStorage();
        this.onViewpointsChange([...this.viewpoints]);
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

    exportToJson(): string {
        return JSON.stringify(this.viewpoints, null, 2);
    }

    importFromJson(jsonStr: string): boolean {
        try {
            const data = JSON.parse(jsonStr);
            if (Array.isArray(data)) {
                this.viewpoints = [...this.viewpoints, ...data];
                // Deduplicate by ID
                const seen = new Set();
                this.viewpoints = this.viewpoints.filter(v => {
                    if (seen.has(v.id)) return false;
                    seen.add(v.id);
                    return true;
                });
                this.saveToStorage();
                this.onViewpointsChange([...this.viewpoints]);
                return true;
            }
            return false;
        } catch (e) {
            console.error("BCF Import Failed", e);
            return false;
        }
    }

    private saveToStorage() {
        localStorage.setItem('bimvision_bcf_viewpoints', JSON.stringify(this.viewpoints));
    }
}

export const bcfManager = new BcfManager();
