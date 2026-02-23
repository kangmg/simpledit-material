/**
 * Optimized label rendering with dirty checking and RAF batching
 * Reduces DOM updates from every frame to only when needed
 */
export class LabelRenderer {
    constructor() {
        this.dirtyLabels = new Set(); // Track which labels need update
        this.rafId = null; // RequestAnimationFrame ID
        this.atoms = null; // Reference to atoms array
        this.camera = null; // Reference to camera
        this.canvas = null; // Reference to canvas
    }

    /**
     * Initialize renderer with references
     * @param {Object[]} atoms - Atoms array
     * @param {THREE.Camera} camera - Camera for projection
     * @param {HTMLCanvasElement} canvas - Canvas for size
     */
    init(atoms, camera, canvas) {
        this.atoms = atoms;
        this.camera = camera;
        this.canvas = canvas;
    }

    /**
     * Mark a specific label as dirty (needs update)
     * @param {number} atomIndex - Index of atom whose label needs update
     */
    markDirty(atomIndex) {
        this.dirtyLabels.add(atomIndex);
        this.scheduleUpdate();
    }

    /**
     * Mark all labels as dirty
     */
    markAllDirty() {
        if (!this.atoms) return;
        for (let i = 0; i < this.atoms.length; i++) {
            this.dirtyLabels.add(i);
        }
        this.scheduleUpdate();
    }

    /**
     * Schedule a label update using requestAnimationFrame
     * Ensures updates happen at most once per frame
     */
    scheduleUpdate() {
        if (this.rafId !== null) return; // Already scheduled

        this.rafId = requestAnimationFrame(() => {
            this.updateDirtyLabels();
            this.rafId = null;
        });
    }

    /**
     * Update only dirty labels in batched manner
     * Separates DOM reads and writes to minimize reflow
     */
    updateDirtyLabels() {
        if (!this.atoms || !this.camera || !this.canvas) return;
        if (this.dirtyLabels.size === 0) return;

        // Batch: Read phase (DOM reads)
        const updates = [];
        this.dirtyLabels.forEach(idx => {
            const atom = this.atoms[idx];
            if (!atom || !atom.label || !atom.mesh) return;

            const position = this.getScreenPosition(atom);
            if (position) {
                updates.push({ atom, position });
            }
        });

        // Batch: Write phase (DOM writes)
        updates.forEach(({ atom, position }) => {
            atom.label.style.left = `${position.x}px`;
            atom.label.style.top = `${position.y}px`;
        });

        this.dirtyLabels.clear();
    }

    /**
     * Get screen position for an atom
     * @param {Object} atom - Atom with mesh
     * @returns {Object|null} {x, y} screen coordinates or null
     */
    getScreenPosition(atom) {
        if (!atom.mesh) return null;

        const pos = atom.mesh.position.clone();
        pos.project(this.camera);

        const x = (pos.x * 0.5 + 0.5) * this.canvas.clientWidth;
        const y = (pos.y * -0.5 + 0.5) * this.canvas.clientHeight;

        return { x, y };
    }

    /**
     * Update all labels (fallback for full updates)
     * Used when camera moves or all labels need refresh
     */
    updateAllLabels() {
        this.markAllDirty();
    }

    /**
     * Cancel any pending update
     */
    cancelUpdate() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        this.cancelUpdate();
        this.dirtyLabels.clear();
        this.atoms = null;
        this.camera = null;
        this.canvas = null;
    }
}
