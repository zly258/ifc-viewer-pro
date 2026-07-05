import type { BufferGeometry, Raycaster } from 'three';

declare module 'three-mesh-bvh' {
    /** Builds a BVH acceleration structure on the geometry. */
    export function computeBoundsTree(this: BufferGeometry): void;

    /** Disposes the BVH acceleration structure. */
    export function disposeBoundsTree(this: BufferGeometry): void;

    /** Replaces the default Three.js raycast with a BVH-accelerated one. */
    export function acceleratedRaycast(this: any, raycaster: Raycaster, intersects: any[]): void;
}

// Augment THREE.Raycaster to expose the BVH firstHitOnly property
declare module 'three' {
    interface Raycaster {
        /** When true (BVH mode), raycasting stops after the first intersection found. */
        firstHitOnly?: boolean;
    }

    interface BufferGeometry {
        /** Builds a BVH acceleration structure on this geometry. Set by three-mesh-bvh. */
        computeBoundsTree?: () => void;
        /** Disposes the BVH acceleration structure. Set by three-mesh-bvh. */
        disposeBoundsTree?: () => void;
    }
}
