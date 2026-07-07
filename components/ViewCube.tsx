import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ifcManager } from '../services/ifcManager';
import { CameraView } from '../types';

const ViewCube: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = 100;
    const height = 100;

    const scene = new THREE.Scene();
    
    // Orthographic is better for ViewCube, but Perspective works too.
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 2.5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);

    // Create Cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    
    // Create materials for each face with text
    const createFaceMaterial = (text: string, color: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.MeshBasicMaterial({ color });
        
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 128, 128);
        
        // Border
        ctx.strokeStyle = '#94a3b8'; // slate-400
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, 128, 128);
        
        // Text
        ctx.fillStyle = '#334155'; // slate-700
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        return new THREE.MeshBasicMaterial({ map: texture });
    };

    const materials = [
        createFaceMaterial('右', '#e2e8f0'), // Right (px)
        createFaceMaterial('左', '#e2e8f0'), // Left (nx)
        createFaceMaterial('顶', '#cbd5e1'), // Top (py)
        createFaceMaterial('底', '#cbd5e1'), // Bottom (ny)
        createFaceMaterial('前', '#f8fafc'), // Front (pz)
        createFaceMaterial('后', '#f8fafc')  // Back (nz)
    ];

    const cube = new THREE.Mesh(geometry, materials);
    scene.add(cube);

    const faceToView = [
        CameraView.RIGHT,
        CameraView.LEFT,
        CameraView.TOP,
        CameraView.BOTTOM,
        CameraView.FRONT,
        CameraView.BACK
    ];

    // Interactivity
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
        const rect = containerRef.current!.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(cube);
        
        if (intersects.length > 0) {
            const index = Math.floor(intersects[0].faceIndex! / 2);
            if (ifcManager.setCameraView) {
                 ifcManager.setCameraView(faceToView[index]);
            }
        }
    };
    containerRef.current.addEventListener('click', onClick);

    let animationId: number;
    const animate = () => {
        animationId = requestAnimationFrame(animate);
        if (ifcManager.camera) {
            // Sync rotation from main camera to view cube camera
            camera.quaternion.copy(ifcManager.camera.quaternion);
        }
        renderer.render(scene, camera);
    };
    animate();

    return () => {
        cancelAnimationFrame(animationId);
        if (containerRef.current) {
             containerRef.current.removeEventListener('click', onClick);
        }
        renderer.dispose();
        geometry.dispose();
        materials.forEach(m => m.dispose());
        if (containerRef.current && containerRef.current.firstChild) {
            containerRef.current.removeChild(containerRef.current.firstChild);
        }
    };
  }, []);

  return (
    <div 
        ref={containerRef} 
        style={{ 
            position: 'absolute', 
            top: 20, 
            right: 20, 
            width: 100, 
            height: 100, 
            zIndex: 40,
            cursor: 'pointer',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}
        title="点击面切换视图"
    />
  );
};

export default ViewCube;
