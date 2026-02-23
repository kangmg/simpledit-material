import * as THREE from 'three';

export class Interaction {
    constructor(renderer, canvas) {
        this.renderer = renderer;
        this.canvas = canvas;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Events - use capture phase to intercept before OrbitControls
        // capture: true ensures our handlers run BEFORE OrbitControls
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this), { capture: true });
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this), { capture: true });
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this), { capture: true });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { capture: true });
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));

        this.callbacks = {
            onClick: null,
            onRightClick: null,
            onDrag: null,
            onDragStart: null,
            onDragEnd: null,
            onHover: null
        };

        this.isDragging = false;
        this.dragStartPos = new THREE.Vector2();
    }

    getMousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
            y: -((event.clientY - rect.top) / rect.height) * 2 + 1
        };
    }

    updateRaycaster() {
        const camera = this.renderer.activeCamera || this.renderer.camera;
        this.raycaster.setFromCamera(this.mouse, camera);
    }

    onMouseMove(event) {
        // event.preventDefault(); // Removed to allow default behavior if needed, or handle selectively
        const pos = this.getMousePosition(event);
        this.mouse.set(pos.x, pos.y);
        this.updateRaycaster();

        if (this.isDragging && this.callbacks.onDrag) {
            this.callbacks.onDrag(event, this.raycaster);
        } else if (this.callbacks.onHover) {
            this.callbacks.onHover(this.raycaster);
        }
    }


    onMouseDown(event) {
        this.canvas.focus();

        if (event.button === 0) { // Left click
            this.isDragging = true;
            const pos = this.getMousePosition(event);
            this.mouse.set(pos.x, pos.y);
            this.updateRaycaster();

            this.dragStartPos.set(pos.x, pos.y);

            // Call callback and check if it wants to prevent default
            let shouldPreventDefault = false;
            if (this.callbacks.onDragStart) {
                shouldPreventDefault = this.callbacks.onDragStart(event, this.raycaster);
            }

            // Only preventDefault if callback requested it
            if (shouldPreventDefault) {
                event.preventDefault();
                event.stopPropagation();
            }
        } else if (event.button === 2) { // Right click
            const pos = this.getMousePosition(event);
            this.mouse.set(pos.x, pos.y);
            this.updateRaycaster();

            if (this.callbacks.onRightClick) {
                this.callbacks.onRightClick(event, this.raycaster);
            }
        }
    }

    onMouseUp(event) {
        if (event.button === 0) {
            this.isDragging = false;
            const pos = this.getMousePosition(event);
            this.mouse.set(pos.x, pos.y);
            this.updateRaycaster();

            // If moved significantly, it's a drag end, otherwise click
            if (this.dragStartPos.distanceTo(new THREE.Vector2(pos.x, pos.y)) < 0.01) {
                if (this.callbacks.onClick) {
                    this.callbacks.onClick(event, this.raycaster);
                }
            } else {
                if (this.callbacks.onDragEnd) {
                    this.callbacks.onDragEnd(event, this.raycaster);
                }
            }
        }
    }

    onKeyDown(event) {
        // Handle modifier keys state if needed
    }

    onKeyUp(event) {
        // Handle modifier keys state if needed
    }
}
