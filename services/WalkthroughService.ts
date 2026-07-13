import * as THREE from 'three';
import { SceneService } from './SceneService';
import { ModelService } from './ModelService';
import type { PostProcessingManager } from './PostProcessing';

export class WalkthroughService {
  private sceneService: SceneService;
  private modelService: ModelService;

  public isWalking: boolean = false;
  private walkKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
  private mouseDragging: boolean = false;
  private prevMousePos = { x: 0, y: 0 };
  private walkSpeed: number = 0.8;
  private lookSpeed: number = 0.003;

  private cameraYaw: number = 0;
  private cameraPitch: number = 0;

  // Mobile touch
  private touchStartPos = { x: 0, y: 0 };
  private touchStartDist: number = 0;
  private isPinching: boolean = false;

  // PostProcessing reference (set by facade)
  public postProcessing: PostProcessingManager | null = null;

  // Callbacks
  public onEnter: (() => void) | null = null;
  public onExit: (() => void) | null = null;

  constructor(sceneService: SceneService, modelService: ModelService) {
    this.sceneService = sceneService;
    this.modelService = modelService;
  }

  activate() {
    if (this.isWalking) return;
    this.isWalking = true;

    // Switch to perspective
    this.sceneService.switchToPerspective();
    this.postProcessing?.setCamera(this.sceneService.persCamera);

    // Position camera
    const { center, size } = this.modelService.getMergedBoundingBox();
    if (size > 0) {
      this.sceneService.persCamera.position.copy(center).add(new THREE.Vector3(0, size * 0.3, size * 0.6));
      this.sceneService.persCamera.lookAt(center);

      const dir = new THREE.Vector3();
      this.sceneService.persCamera.getWorldDirection(dir);
      this.cameraYaw = Math.atan2(-dir.x, -dir.z);
      this.cameraPitch = Math.asin(dir.y);
    } else {
      this.sceneService.persCamera.position.set(0, 1.6, 15);
      this.cameraYaw = 0;
      this.cameraPitch = 0;
    }

    this.sceneService.persCamera.updateProjectionMatrix();
    this.updateCameraRotation();

    // Disable orbit
    this.sceneService.controls.enabled = false;

    // Attach listeners
    window.addEventListener('keydown', this.handleWalkKeyDown);
    window.addEventListener('keyup', this.handleWalkKeyUp);

    const container = this.sceneService.getContainer();
    if (container) {
      container.addEventListener('mousedown', this.handleWalkMouseDown);
      container.addEventListener('mousemove', this.handleWalkMouseMove);
      window.addEventListener('mouseup', this.handleWalkMouseUp);
      container.addEventListener('wheel', this.handleWalkWheel, { passive: false });
      container.addEventListener('touchstart', this.handleWalkTouchStart, { passive: false });
      container.addEventListener('touchmove', this.handleWalkTouchMove, { passive: false });
      container.addEventListener('touchend', this.handleWalkTouchEnd);
    }

    this.sceneService.isDirty = true;
    this.onEnter?.();
  }

  deactivate() {
    if (!this.isWalking) return;
    this.isWalking = false;

    this.walkKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
    this.mouseDragging = false;
    this.isPinching = false;

    // Switch back to ortho
    this.sceneService.switchToOrthographic();
    this.postProcessing?.setCamera(this.sceneService.orthoCamera);
    this.sceneService.controls.enabled = true;
    this.sceneService.controls.update();

    // Remove listeners
    window.removeEventListener('keydown', this.handleWalkKeyDown);
    window.removeEventListener('keyup', this.handleWalkKeyUp);

    const c = this.sceneService.getContainer();
    if (c) {
      c.removeEventListener('mousedown', this.handleWalkMouseDown);
      c.removeEventListener('mousemove', this.handleWalkMouseMove);
      window.removeEventListener('mouseup', this.handleWalkMouseUp);
      c.removeEventListener('wheel', this.handleWalkWheel);
      c.removeEventListener('touchstart', this.handleWalkTouchStart);
      c.removeEventListener('touchmove', this.handleWalkTouchMove);
      c.removeEventListener('touchend', this.handleWalkTouchEnd);
    }

    this.sceneService.isDirty = true;
    this.onExit?.();
  }

  // Called each frame by the render loop
  updatePosition() {
    if (!this.isWalking) return;

    const speed = this.walkSpeed * (this.walkKeys.shift ? 2.5 : 1.0);
    const forward = new THREE.Vector3();
    this.sceneService.persCamera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, this.sceneService.persCamera.up).normalize();

    const moveVec = new THREE.Vector3(0, 0, 0);
    if (this.walkKeys.w) moveVec.addScaledVector(forward, speed);
    if (this.walkKeys.s) moveVec.addScaledVector(forward, -speed);
    if (this.walkKeys.a) moveVec.addScaledVector(right, -speed);
    if (this.walkKeys.d) moveVec.addScaledVector(right, speed);
    if (this.walkKeys.q) moveVec.y += speed;
    if (this.walkKeys.e) moveVec.y -= speed;

    if (moveVec.lengthSq() === 0) return;

    const collisionFreePos = this.checkCollision(this.sceneService.persCamera.position, moveVec);
    this.sceneService.persCamera.position.copy(collisionFreePos);
    this.snapToFloor();
  }

  // ── Keyboard ──
  private handleWalkKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    let activeKey = false;
    if (key === 'w' || key === 'arrowup') { this.walkKeys.w = true; activeKey = true; }
    if (key === 'a' || key === 'arrowleft') { this.walkKeys.a = true; activeKey = true; }
    if (key === 's' || key === 'arrowdown') { this.walkKeys.s = true; activeKey = true; }
    if (key === 'd' || key === 'arrowright') { this.walkKeys.d = true; activeKey = true; }
    if (key === 'q') { this.walkKeys.q = true; activeKey = true; }
    if (key === 'e') { this.walkKeys.e = true; activeKey = true; }
    if (e.shiftKey) this.walkKeys.shift = true;

    if (activeKey) {
      this.sceneService.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
      this.sceneService.isDirty = true;
    }
  };

  private handleWalkKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') this.walkKeys.w = false;
    if (key === 'a' || key === 'arrowleft') this.walkKeys.a = false;
    if (key === 's' || key === 'arrowdown') this.walkKeys.s = false;
    if (key === 'd' || key === 'arrowright') this.walkKeys.d = false;
    if (key === 'q') this.walkKeys.q = false;
    if (key === 'e') this.walkKeys.e = false;
    if (!e.shiftKey) this.walkKeys.shift = false;

    const hasActiveKeys = this.walkKeys.w || this.walkKeys.a || this.walkKeys.s || this.walkKeys.d || this.walkKeys.q || this.walkKeys.e;
    if (!hasActiveKeys) {
      this.sceneService.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.sceneService.isDirty = true;
    }
  };

  // ── Mouse look ──
  private handleWalkMouseDown = (e: MouseEvent) => {
    this.mouseDragging = true;
    this.prevMousePos = { x: e.clientX, y: e.clientY };
    this.sceneService.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    this.sceneService.isDirty = true;
  };

  private handleWalkMouseMove = (e: MouseEvent) => {
    if (!this.mouseDragging) return;

    const deltaX = e.clientX - this.prevMousePos.x;
    const deltaY = e.clientY - this.prevMousePos.y;
    this.prevMousePos = { x: e.clientX, y: e.clientY };

    this.cameraYaw -= deltaX * this.lookSpeed;
    this.cameraPitch -= deltaY * this.lookSpeed;

    const limit = Math.PI / 2 - 0.05;
    this.cameraPitch = Math.max(-limit, Math.min(limit, this.cameraPitch));
    this.updateCameraRotation();
  };

  private handleWalkMouseUp = () => {
    this.mouseDragging = false;
    this.sceneService.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.sceneService.isDirty = true;
  };

  private updateCameraRotation() {
    const target = new THREE.Vector3(
      -Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
      Math.sin(this.cameraPitch),
      -Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
    );
    this.sceneService.persCamera.lookAt(
      this.sceneService.persCamera.position.clone().add(target)
    );
  }

  // ── Wheel zoom (FOV) ──
  private handleWalkWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.isWalking) return;

    const delta = e.deltaY > 0 ? 1.5 : -1.5;
    this.sceneService.persCamera.fov = Math.max(
      15,
      Math.min(110, this.sceneService.persCamera.fov + delta)
    );
    this.sceneService.persCamera.updateProjectionMatrix();
  };

  // ── Touch ──
  private handleWalkTouchStart = (e: TouchEvent) => {
    this.sceneService.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    this.sceneService.isDirty = true;
    if (e.touches.length === 1) {
      this.mouseDragging = true;
      this.prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.isPinching = false;
    } else if (e.touches.length === 2) {
      this.mouseDragging = false;
      this.isPinching = true;
      this.touchStartPos = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.touchStartDist = Math.sqrt(dx * dx + dy * dy);
    }
  };

  private handleWalkTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && this.mouseDragging) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - this.prevMousePos.x;
      const deltaY = touch.clientY - this.prevMousePos.y;
      this.prevMousePos = { x: touch.clientX, y: touch.clientY };

      this.cameraYaw -= deltaX * this.lookSpeed * 1.5;
      this.cameraPitch -= deltaY * this.lookSpeed * 1.5;

      const limit = Math.PI / 2 - 0.05;
      this.cameraPitch = Math.max(-limit, Math.min(limit, this.cameraPitch));
      this.updateCameraRotation();
    } else if (e.touches.length === 2 && this.isPinching) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const currentPos = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };

      const distDelta = dist - this.touchStartDist;
      this.touchStartDist = dist;

      const forward = distDelta * 0.2;
      const moveVec = new THREE.Vector3();
      this.sceneService.persCamera.getWorldDirection(moveVec);
      moveVec.y = 0;
      moveVec.normalize();
      moveVec.multiplyScalar(forward);

      const sideDeltaX = currentPos.x - this.touchStartPos.x;
      const rightVec = new THREE.Vector3();
      rightVec.crossVectors(moveVec, this.sceneService.persCamera.up).normalize();
      moveVec.addScaledVector(rightVec, -sideDeltaX * 0.1);

      this.sceneService.persCamera.position.add(moveVec);
      this.touchStartPos = currentPos;
    }
  };

  private handleWalkTouchEnd = () => {
    this.mouseDragging = false;
    this.isPinching = false;
    this.sceneService.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.sceneService.isDirty = true;
  };

  // ── Collision ──
  private checkCollision(currentPos: THREE.Vector3, moveVec: THREE.Vector3): THREE.Vector3 {
    const bodyRadius = 1.0;
    const moveDir = moveVec.clone().normalize();
    const moveDist = moveVec.length();

    const meshes: THREE.Mesh[] = [];
    this.modelService.models.forEach((m) => {
      if (m.group.visible !== false) {
        m.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.visible) meshes.push(c);
        });
      }
    });

    if (meshes.length === 0) return currentPos.clone().add(moveVec);

    const raycaster = new THREE.Raycaster();
    const rayStart = currentPos.clone();
    raycaster.set(rayStart, moveDir);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const obstacleDistance = hit.distance;
      if (obstacleDistance < bodyRadius + moveDist) {
        const wallNormal = hit.face?.normal.clone();
        if (wallNormal) {
          wallNormal.transformDirection(hit.object.matrixWorld);
          const dot = moveVec.dot(wallNormal);
          const slideVec = moveVec.clone().addScaledVector(wallNormal, -dot);
          if (slideVec.lengthSq() > 0.001) {
            const slideDir = slideVec.clone().normalize();
            const slideDist = slideVec.length();
            raycaster.set(rayStart, slideDir);
            const slideIntersects = raycaster.intersectObjects(meshes, false);
            if (slideIntersects.length > 0 && slideIntersects[0].distance < bodyRadius + slideDist) {
              return currentPos;
            }
            return currentPos.clone().add(slideVec);
          }
        }
        return currentPos;
      }
    }
    return currentPos.clone().add(moveVec);
  }

  // ── Floor snapping ──
  private snapToFloor() {
    const eyeHeight = 1.6;
    const maxStepHeight = 0.5;

    const meshes: THREE.Mesh[] = [];
    this.modelService.models.forEach((m) => {
      if (m.group.visible !== false) {
        m.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.visible) meshes.push(c);
        });
      }
    });
    if (meshes.length === 0) return;

    const raycaster = new THREE.Raycaster();
    const rayStart = this.sceneService.persCamera.position.clone();
    rayStart.y += maxStepHeight;
    raycaster.set(rayStart, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const floorHeight = intersects[0].point.y;
      const targetY = floorHeight + eyeHeight;
      const yDiff = Math.abs(this.sceneService.persCamera.position.y - targetY);
      if (yDiff < eyeHeight + maxStepHeight + 2.0) {
        this.sceneService.persCamera.position.y = THREE.MathUtils.lerp(
          this.sceneService.persCamera.position.y,
          targetY,
          0.2
        );
      }
    }
  }

  dispose() {
    if (this.isWalking) this.deactivate();
  }
}
