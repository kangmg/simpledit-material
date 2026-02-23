import * as THREE from 'three';

export class AxisHelper {
    constructor(editor) {
        this.editor = editor;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 1000);
        this.camera.position.z = 100;
        this.camera.lookAt(0, 0, 0);

        this.createCustomAxes();
    }

    createCustomAxes() {
        const axisLength = 40;
        const headLength = 10;
        const headRadius = 5;

        // X Axis (Red)
        const xArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            axisLength,
            0xff0000,
            headLength,
            headRadius
        );
        this.scene.add(xArrow);

        // Y Axis (Green)
        const yArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 0),
            axisLength,
            0x00ff00,
            headLength,
            headRadius
        );
        this.scene.add(yArrow);

        // Z Axis (Blue)
        const zArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, 0),
            axisLength,
            0x0000ff,
            headLength,
            headRadius
        );
        this.scene.add(zArrow);

        // Add labels
        // We can use sprites for X, Y, Z labels
        this.addLabel('X', 50, 0, 0, 'red');
        this.addLabel('Y', 0, 50, 0, 'green');
        this.addLabel('Z', 0, 0, 50, 'blue');
    }

    addLabel(text, x, y, z, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.font = 'Bold 48px Arial';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(x, y, z);
        sprite.scale.set(20, 20, 1);
        this.scene.add(sprite);
    }

    render(renderer) {
        if (!renderer) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        // Sync rotation with main camera
        const mainCamera = this.editor.renderer.activeCamera || this.editor.renderer.camera;
        this.camera.rotation.copy(mainCamera.rotation);
        this.camera.position.copy(mainCamera.position).normalize().multiplyScalar(100);
        this.camera.up.copy(mainCamera.up);
        this.camera.lookAt(0, 0, 0);

        // Render to bottom-left corner
        const size = 150;
        const padding = 10;

        renderer.setScissorTest(true);
        renderer.setScissor(padding, padding, size, size);
        renderer.setViewport(padding, padding, size, size);

        renderer.clearDepth();
        renderer.render(this.scene, this.camera);

        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
    }
}
