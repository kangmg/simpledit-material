import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 10;

    // Orthographic Camera
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 20;
    this.orthoCamera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    this.orthoCamera.position.z = 10;

    this.activeCamera = this.orthoCamera; // Start with Orthographic

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Controls
    this.orbitControls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.minDistance = 2;
    this.orbitControls.maxDistance = 50;
    this.orbitControls.enabled = false;

    this.trackballControls = new TrackballControls(this.activeCamera, this.renderer.domElement);
    this.trackballControls.rotateSpeed = 2.0;
    this.trackballControls.zoomSpeed = 1.2;
    this.trackballControls.panSpeed = 0.8;
    this.trackballControls.noZoom = false;
    this.trackballControls.noPan = false;
    this.trackballControls.staticMoving = true;
    this.trackballControls.dynamicDampingFactor = 0.3;
    this.trackballControls.enabled = true;

    this.controls = this.trackballControls; // Active controls reference

    // Store original mouse controls state for toggling
    this.originalTrackballNoPan = this.trackballControls.noPan;
    this.originalTrackballNoRotate = this.trackballControls.noRotate;

    // Lights - full ambient light to minimize shadows
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight.position.set(10, 10, 10);
    this.scene.add(directionalLight);

    // Axis Helper Scene (bottom-left corner)
    this.axisScene = new THREE.Scene();
    this.axisScene.background = null; // Transparent background

    // Use orthographic camera to prevent perspective distortion
    const axisSize = 3.5; // Increased from 2.5 to prevent arrow clipping
    this.axisCamera = new THREE.OrthographicCamera(
      -axisSize, axisSize,  // left, right
      axisSize, -axisSize,  // top, bottom
      0.1, 100              // near, far
    );
    this.axisCamera.position.set(0, 0, 5);

    // Create custom thick axis arrows (X=red, Y=green, Z=blue)
    const axisLength = 2.0;
    const axisRadius = 0.12;     // Increased from 0.08 for thicker shafts
    const arrowLength = 0.5;
    const arrowRadius = 0.20;    // Increased from 0.15 for thicker heads

    // Helper function to create thick arrow
    const createArrow = (color) => {
      const group = new THREE.Group();

      // Arrow shaft (cylinder)
      const shaftGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 16);
      const shaftMaterial = new THREE.MeshBasicMaterial({
        color,
        depthTest: false,  // Disable depth test so atoms render on top
        depthWrite: false
      });
      const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
      shaft.position.y = axisLength / 2;
      group.add(shaft);

      // Arrow head (cone)
      const headGeometry = new THREE.ConeGeometry(arrowRadius, arrowLength, 16);
      const headMaterial = new THREE.MeshBasicMaterial({
        color,
        depthTest: false,  // Disable depth test so atoms render on top
        depthWrite: false
      });
      const head = new THREE.Mesh(headGeometry, headMaterial);
      head.position.y = axisLength + arrowLength / 2;
      group.add(head);

      return group;
    };

    // X axis (red) - rotate to point right
    const xAxis = createArrow(0xff0000);
    xAxis.rotation.z = -Math.PI / 2;
    this.axisScene.add(xAxis);

    // Y axis (green) - already points up
    const yAxis = createArrow(0x00ff00);
    this.axisScene.add(yAxis);

    // Z axis (blue) - rotate to point forward
    const zAxis = createArrow(0x0000ff);
    zAxis.rotation.x = Math.PI / 2;
    this.axisScene.add(zAxis);

    // Add X, Y, Z labels at arrow tips
    this.addAxisLabel('X', 2.8, 0, 0, 0xff0000);  // Right
    this.addAxisLabel('Y', 0, 2.8, 0, 0x00ff00);  // Up
    this.addAxisLabel('Z', 0, 0, 2.8, 0x0000ff);  // Forward (not at Y!)

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  addAxisLabel(text, x, y, z, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.font = 'Bold 48px Arial';
    context.fillStyle = '#' + color.toString(16).padStart(6, '0');
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,  // Disable depth test so atoms render on top
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(0.8, 0.8, 1);
    this.axisScene.add(sprite);
  }

  setProjection(type) {
    if (type === 'perspective') {
      this.activeCamera = this.camera;
    } else if (type === 'orthographic') {
      this.activeCamera = this.orthoCamera;
      // Match position/rotation roughly or just reset?
      // For now, let's keep them independent or sync position if needed.
      // Syncing position is better for UX.
      this.orthoCamera.position.copy(this.camera.position);
      this.orthoCamera.quaternion.copy(this.camera.quaternion);
      this.orthoCamera.zoom = 1; // Reset zoom or calculate equivalent?
      this.orthoCamera.updateProjectionMatrix();
    }

    // Update controls to use new camera
    this.orbitControls.object = this.activeCamera;
    this.trackballControls.object = this.activeCamera;

    // Reset controls to prevent momentum carrying over
    this.orbitControls.reset();
    this.trackballControls.reset();

    // Explicitly clear to prevent ghosting artifacts
    this.renderer.clear();

    this.orbitControls.update();
    this.trackballControls.update();
  }

  setCameraMode(mode) {
    if (mode === 'orbit') {
      this.orbitControls.enabled = true;
      this.trackballControls.enabled = false;
      this.controls = this.orbitControls;
      // Reset camera up for orbit mode to prevent weird orientation
      this.activeCamera.up.set(0, 1, 0);
    } else if (mode === 'trackball') {
      this.orbitControls.enabled = false;
      this.trackballControls.enabled = true;
      this.controls = this.trackballControls;
    }
  }

  onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;

    // Update Perspective
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // Update Orthographic
    const frustumSize = 20;
    this.orthoCamera.left = -frustumSize * aspect / 2;
    this.orthoCamera.right = frustumSize * aspect / 2;
    this.orthoCamera.top = frustumSize / 2;
    this.orthoCamera.bottom = -frustumSize / 2;
    this.orthoCamera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.trackballControls.handleResize();
  }

  render() {
    this.controls.update();

    // STEP 1: Render main scene with white background
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.activeCamera);

    // STEP 2: Render axis helper on top in bottom-left corner
    const size = 200;
    const padding = 10;

    this.renderer.setViewport(padding, padding, size, size);
    this.renderer.setScissor(padding, padding, size, size);
    this.renderer.setScissorTest(true);

    // Clear ONLY the axis area (color + depth) to make it transparent
    this.renderer.autoClear = false;
    this.renderer.clear(true, true, false);

    // Render axis ONLY (atoms render on top automatically due to depthTest=false)
    this.axisCamera.position.copy(this.activeCamera.position);
    this.axisCamera.position.sub(this.controls.target || new THREE.Vector3());
    this.axisCamera.position.setLength(5);
    this.axisCamera.lookAt(this.axisScene.position);
    this.renderer.render(this.axisScene, this.axisCamera);

    // Reset
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.autoClear = true;
  }

  /**
   * Capture molecule snapshot
   * @param {THREE.Object3D[]} objects - Array of objects to capture (atoms, bonds, labels)
   * @param {boolean} transparentBg - Whether to use transparent background
   * @param {number} padding - Padding multiplier (default: 1.3)
   * @returns {string} - Data URL of the captured image
   */
  captureSnapshot(objects, transparentBg = false, padding = 1.1) {
    if (objects.length === 0) {
      return null;
    }

    // Calculate bounding box in Camera Space for tight cropping
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    // We need to account for atom radius
    // Transform each atom position to camera space and expand bounds by radius
    const viewMatrixInverse = this.activeCamera.matrixWorldInverse;

    objects.forEach(obj => {
      if (obj.geometry && obj.userData && obj.userData.type === 'atom') {
        // Get position in camera space
        const pos = obj.position.clone().applyMatrix4(viewMatrixInverse);

        // Get radius in world/camera space (assuming uniform scale)
        // SphereGeometry parameters.radius is the base radius
        const radius = obj.geometry.parameters.radius * obj.scale.x;

        minX = Math.min(minX, pos.x - radius);
        maxX = Math.max(maxX, pos.x + radius);
        minY = Math.min(minY, pos.y - radius);
        maxY = Math.max(maxY, pos.y + radius);
      } else if (obj.userData && obj.userData.type === 'bond') {
        // For bonds (cylinders), check endpoints
        // Bond mesh is positioned at midpoint, scaled and rotated.
        // Simpler to just use the two atoms it connects if available, 
        // but if we only have the mesh, we can use its bounding box.
        // For now, atoms usually cover the extent, but let's be safe:
        // If we iterate atoms, we cover the molecule. 
        // If 'objects' contains bonds, we might double count or handle them.
        // Usually 'objects' passed from command contains atoms. 
        // Let's assume atoms define the bounds.
      }
    });

    // If no atoms found (e.g. only bonds?), fall back to world box logic or handle error
    if (minX === Infinity) {
      // Fallback to old logic if something went wrong
      return this.captureSnapshotLegacy(objects, transparentBg, padding);
    }

    // Calculate dimensions
    const width = maxX - minX;
    const height = maxY - minY;

    // Apply padding
    const padX = width * (padding - 1) / 2;
    const padY = height * (padding - 1) / 2;

    const finalMinX = minX - padX;
    const finalMaxX = maxX + padX;
    const finalMinY = minY - padY;
    const finalMaxY = maxY + padY;

    const finalWidth = finalMaxX - finalMinX;
    const finalHeight = finalMaxY - finalMinY;

    // Set canvas size preserving aspect ratio
    const maxRes = 1920;
    let captureWidth, captureHeight;

    if (finalWidth > finalHeight) {
      captureWidth = maxRes;
      captureHeight = Math.round(maxRes * (finalHeight / finalWidth));
    } else {
      captureHeight = maxRes;
      captureWidth = Math.round(maxRes * (finalWidth / finalHeight));
    }

    // Create offscreen canvas
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = captureWidth;
    offscreenCanvas.height = captureHeight;

    // Create temporary renderer
    const tempRenderer = new THREE.WebGLRenderer({
      canvas: offscreenCanvas,
      antialias: true,
      alpha: transparentBg,
      preserveDrawingBuffer: true
    });
    tempRenderer.setSize(captureWidth, captureHeight);
    tempRenderer.setPixelRatio(1);

    // Set background
    const originalBackground = this.scene.background;
    if (transparentBg) {
      this.scene.background = null;
    } else {
      this.scene.background = new THREE.Color(0xffffff);
    }

    // Create camera for snapshot
    let snapshotCamera;

    if (this.activeCamera.isOrthographicCamera) {
      // For Orthographic, we can set the frustum exactly to our bounds
      snapshotCamera = new THREE.OrthographicCamera(
        finalMinX, finalMaxX,
        finalMaxY, finalMinY,
        0.1, 1000
      );
    } else {
      // For Perspective, it's harder to crop exactly. 
      // We'll use the aspect ratio and try to frame it.
      // But for now, let's just use Orthographic for snapshots as it's cleaner for 2D representation
      // OR, we can try to match the perspective view.
      // Given the user issue "too much whitespace", Ortho is the best fix.
      // Let's force Ortho for snapshot if the user didn't strictly request perspective?
      // No, let's stick to the active camera type but try to fit.

      // If Perspective, we use the calculated aspect ratio.
      const aspect = captureWidth / captureHeight;
      snapshotCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);

      // We need to position the camera to fit the height 'finalHeight' at the object's depth.
      // This is complex because depth varies.
      // Fallback: Use the legacy logic for Perspective for now, or just use Ortho.
      // Let's use Ortho for the snapshot to guarantee tight crop as requested.
      // User didn't specify "keep perspective".
      snapshotCamera = new THREE.OrthographicCamera(
        finalMinX, finalMaxX,
        finalMaxY, finalMinY,
        0.1, 1000
      );
    }

    // Position camera
    // We calculated bounds in Camera Space, where the camera is at (0,0,0) looking down -Z (usually).
    // Actually, Camera Space is defined by the camera's transform.
    // If we create a new camera and copy the transform, its "Camera Space" is the same.
    // So 'minX' etc are relative to this transform.
    // OrthographicCamera defines bounds relative to its center.
    // So if we set left=minX, right=maxX, etc., and position the camera at the SAME spot as activeCamera,
    // it should frame exactly those coordinates.

    snapshotCamera.position.copy(this.activeCamera.position);
    snapshotCamera.quaternion.copy(this.activeCamera.quaternion);
    snapshotCamera.updateMatrixWorld();

    // Handle Labels
    const tempSprites = [];
    objects.forEach(obj => {
      if (obj.userData && obj.userData.atom) {
        const atom = obj.userData.atom;
        if (atom.label && atom.label.style.display !== 'none' && atom.label.innerText) {
          const sprite = this.createTextSprite(atom.label.innerText);
          sprite.position.copy(obj.position);
          this.scene.add(sprite);
          tempSprites.push(sprite);
        }
      }
    });

    // Render
    tempRenderer.render(this.scene, snapshotCamera);

    // Cleanup Sprites
    tempSprites.forEach(sprite => {
      this.scene.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    });

    // Restore background
    this.scene.background = originalBackground;

    // Capture
    const dataURL = offscreenCanvas.toDataURL('image/png');

    // Cleanup
    tempRenderer.dispose();

    return dataURL;
  }

  captureSnapshotLegacy(objects, transparentBg, padding) {
    // ... (Original implementation if needed, but we can probably drop it)
    return null;
  }

  createTextSprite(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 64; // High resolution for snapshot
    const font = `Bold ${fontSize}px Arial`;
    context.font = font;

    const metrics = context.measureText(text);
    const width = metrics.width;
    const height = fontSize * 1.2;

    canvas.width = width;
    canvas.height = height;

    // Redraw after resizing
    context.font = font;
    context.fillStyle = '#ff0000'; // Red color to match editor
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Draw text centered
    context.fillText(text, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);

    // Scale sprite to match scene units
    const scale = 0.005 * fontSize; // Reduced scale for better fit
    sprite.scale.set(scale * (width / height), scale, 1);

    return sprite;
  }
}
