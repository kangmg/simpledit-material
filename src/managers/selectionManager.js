import * as THREE from 'three';
import { ErrorHandler } from '../utils/errorHandler.js';

/**
 * Manages atom selection state and UI
 * Handles selection highlighting, order tracking, and status updates
 */
export class SelectionManager {
    constructor(editor) {
        this.editor = editor;
        this.state = editor.state; // Reference to EditorState

        // Selection visualization (will be managed by this class)
        this.selectionMode = 'lasso'; // 'lasso' | 'rectangle'
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        // Clear state
        this.state.clearSelection();

        if (!this.editor.molecule) return;

        // Clear visual highlights
        this.editor.molecule.atoms.forEach(atom => {
            atom.selected = false;
            this.editor.renderManager.updateAtomVisuals(atom);
        });
        this.editor.renderManager.updateBondVisuals(); // Update bonds

        this.updateSelectionStatus();
    }

    /**
     * Select an atom
     * @param {Object} atom - Atom to select
     * @param {boolean} add - Whether to add to selection or replace
     */
    selectAtom(atom, add = false) {
        if (!atom) {
            return ErrorHandler.error('No atom provided');
        }

        // Clear previous selection if not adding
        if (!add) {
            this.clearSelection();
        }

        // Toggle selection
        if (atom.selected) {
            this.deselectAtom(atom);
        } else {
            atom.selected = true;
            const index = this.editor.molecule.atoms.indexOf(atom);
            this.state.addToSelection(index, atom);

            // Visual highlight
            this.editor.renderManager.updateAtomVisuals(atom);
            this.editor.renderManager.updateBondVisuals(); // Update bonds
        }

        this.updateSelectionStatus();
        this.updateSelectionStatus();
        const index = this.editor.molecule.atoms.indexOf(atom);
        return ErrorHandler.success(`Atom ${index} selected`);
    }

    /**
     * Toggle selection of an atom
     * @param {Object} atom - Atom to toggle
     * @param {boolean} multiSelect - Whether to allow multiple selection (e.g. Ctrl/Shift key)
     */
    toggleSelection(atom, multiSelect) {
        if (!atom) return;

        if (!multiSelect) {
            // Single select mode
            if (atom.selected) {
                // If clicking the ONLY selected atom, deselect it (toggle off)
                // If multiple atoms are selected and we click one of them, usually we select ONLY that one.
                const selectedCount = this.getSelectedAtoms().length;
                if (selectedCount === 1) {
                    this.deselectAtom(atom);
                } else {
                    // Multiple selected -> select only this one
                    this.clearSelection();
                    this.selectAtom(atom, true);
                }
            } else {
                // Not selected -> clear others and select this one
                this.clearSelection();
                this.selectAtom(atom, true);
            }
        } else {
            // Multi-select mode (Ctrl/Shift)
            if (atom.selected) {
                this.deselectAtom(atom);
            } else {
                this.selectAtom(atom, true);
            }
        }
    }

    /**
     * Deselect an atom
     * @param {Object} atom - Atom to deselect
     */
    deselectAtom(atom) {
        if (!atom) return;

        atom.selected = false;
        const index = this.editor.molecule.atoms.indexOf(atom);
        this.state.removeFromSelection(index, atom);

        // Remove visual highlight
        this.editor.renderManager.updateAtomVisuals(atom);
        this.editor.renderManager.updateBondVisuals(); // Update bonds

        this.updateSelectionStatus();
    }

    /**
     * Select atoms by indices
     * @param {number[]} indices - Atom indices to select
     */
    selectByIndices(indices) {
        this.clearSelection();

        const atoms = this.editor.molecule.atoms;
        for (const idx of indices) {
            if (idx >= 0 && idx < atoms.length) {
                this.selectAtom(atoms[idx], true);
            }
        }
    }

    /**
     * Select atoms in a range (inclusive)
     * @param {number} start - Start index
     * @param {number} end - End index
     */
    selectRange(start, end) {
        const atoms = this.editor.molecule.atoms;
        const indices = [];

        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            if (i >= 0 && i < atoms.length) {
                indices.push(i);
            }
        }

        this.selectByIndices(indices);
    }

    /**
     * Select all atoms
     */
    selectAll() {
        const atoms = this.editor.molecule.atoms;
        this.selectByIndices(atoms.map((_, idx) => idx));
    }

    /**
     * Invert selection
     */
    invertSelection() {
        const atoms = this.editor.molecule.atoms;
        atoms.forEach((atom, idx) => {
            if (atom.selected) {
                this.deselectAtom(atom);
            } else {
                this.selectAtom(atom, true);
            }
        });
    }

    /**
     * Get selected atoms
     * @returns {Object[]} Array of selected atoms
     */
    getSelectedAtoms() {
        return this.editor.molecule.atoms.filter(atom => atom.selected);
    }

    /**
     * Get selection count
     * @returns {number} Number of selected atoms
     */
    getSelectionCount() {
        return this.state.getSelectionCount();
    }

    /**
     * Get selection order (for geometry operations)
     * @returns {Object[]} Array of atoms in selection order
     */
    getSelectionOrder() {
        return this.state.getSelectionOrder();
    }

    /**
     * Update selection mode
     * @param {string} mode - 'lasso' or 'rectangle'
     */
    setSelectionMode(mode) {
        const validModes = ['lasso', 'rectangle'];
        if (!validModes.includes(mode)) {
            return ErrorHandler.error(`Invalid selection mode: ${mode}`);
        }

        this.selectionMode = mode;
        this.updateSelectionStatus();
        return ErrorHandler.success(`Selection mode: ${mode}`);
    }

    /**
     * Cycle through selection modes
     */
    cycleSelectionMode() {
        this.selectionMode = this.selectionMode === 'lasso' ? 'rectangle' : 'lasso';
        this.updateSelectionStatus();
        return this.selectionMode;
    }

    /**
     * Update selection status display
     */
    updateSelectionStatus() {
        const btn = document.getElementById('btn-select');
        if (!btn) return;

        const sub = btn.querySelector('.btn-sublabel');

        // Update sublabel
        if (sub) {
            sub.style.display = 'block';
            if (this.selectionMode === 'rectangle') {
                sub.innerText = 'Rectangle';
                sub.style.color = '#4a90e2';
            } else if (this.selectionMode === 'lasso') {
                sub.innerText = 'Lasso';
                sub.style.color = '#e2904a';
            }
        }

        // Update submode buttons active state
        const btnLasso = document.getElementById('btn-select-lasso');
        const btnRectangle = document.getElementById('btn-select-rectangle');

        if (btnLasso) btnLasso.classList.toggle('active', this.selectionMode === 'lasso');
        if (btnRectangle) btnRectangle.classList.toggle('active', this.selectionMode === 'rectangle');
    }

    /**
     * Clear selection status display
     */
    clearSelectionStatus() {
        const btn = document.getElementById('btn-select');
        if (!btn) return;

        const sub = btn.querySelector('.btn-sublabel');

        if (sub) {
            sub.style.display = 'none';
        } else {
            btn.innerText = 'Select (Lasso/Rect)';
            btn.style.backgroundColor = '';
        }
    }

    /**
     * Update highlights for all atoms (refresh visual state)
     */
    updateHighlights() {
        this.editor.molecule.atoms.forEach(atom => {
            this.editor.renderManager.updateAtomVisuals(atom);
        });
    }

    /**
     * Delete selected atoms
     */
    deleteSelected() {
        const selected = this.getSelectedAtoms();
        if (selected.length === 0) return;

        this.editor.saveState(); // Save before deleting

        // Remove labels first (DOM manipulation)
        selected.forEach(atom => {
            if (atom.label && atom.label.parentNode) {
                atom.label.parentNode.removeChild(atom.label);
                atom.label = null;
            }
            // Mesh removal is handled by rebuildScene, but good to be explicit if optimizing
            if (atom.mesh) {
                this.editor.renderer.scene.remove(atom.mesh);
            }
        });

        // Remove from molecule data
        this.editor.moleculeManager.removeAtoms(selected);

        // Rebuild scene to clean up bonds and update indices
        this.editor.rebuildScene();

        // Clear selection state
        this.clearSelection();
    }
    /**
     * Start selection drag
     * @param {number} x - Mouse X
     * @param {number} y - Mouse Y
     */
    startSelection(x, y) {
        this.selectionStart = new THREE.Vector2(x, y);
        this.lassoPath = [{ x, y }];
        this.createSelectionBox();
    }

    /**
     * Update selection drag
     * @param {number} x - Mouse X
     * @param {number} y - Mouse Y
     */
    updateSelection(x, y) {
        if (!this.selectionStart) return;
        this.updateSelectionBox(x, y);
    }

    /**
     * End selection drag
     * @param {number} x - Mouse X
     * @param {number} y - Mouse Y
     * @param {boolean} add - Whether to add to existing selection
     */
    endSelection(x, y, add) {
        if (!this.selectionStart) return;

        this.performBoxSelection(x, y, add);
        this.removeSelectionBox();
        this.selectionStart = null;
        this.lassoPath = [];
    }

    createSelectionBox() {
        const div = document.createElement('div');
        div.id = 'selection-box';
        div.style.position = 'absolute';
        div.style.pointerEvents = 'none';

        if (this.selectionMode === 'rectangle') {
            div.style.border = '2px dashed #ff8800';
            div.style.backgroundColor = 'rgba(255, 136, 0, 0.15)';
        } else if (this.selectionMode === 'lasso') {
            div.innerHTML = '<svg style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;"><path id="lasso-path" stroke="#ff8800" stroke-width="2" stroke-dasharray="5,5" fill="rgba(255, 136, 0, 0.15)" /></svg>';
            div.style.width = '100%';
            div.style.height = '100%';
            div.style.top = '0';
            div.style.left = '0';
        }

        document.body.appendChild(div);
        this.selectionBox = div;
    }

    updateSelectionBox(x, y) {
        if (this.selectionMode === 'rectangle') {
            const startX = this.selectionStart.x;
            const startY = this.selectionStart.y;

            const minX = Math.min(startX, x);
            const maxX = Math.max(startX, x);
            const minY = Math.min(startY, y);
            const maxY = Math.max(startY, y);

            this.selectionBox.style.left = minX + 'px';
            this.selectionBox.style.top = minY + 'px';
            this.selectionBox.style.width = (maxX - minX) + 'px';
            this.selectionBox.style.height = (maxY - minY) + 'px';
        } else if (this.selectionMode === 'lasso') {
            this.lassoPath.push({ x, y });

            const path = this.selectionBox.querySelector('#lasso-path');
            if (path && this.lassoPath.length > 0) {
                let pathData = `M ${this.lassoPath[0].x} ${this.lassoPath[0].y} `;
                for (let i = 1; i < this.lassoPath.length; i++) {
                    pathData += ` L ${this.lassoPath[i].x} ${this.lassoPath[i].y} `;
                }
                path.setAttribute('d', pathData);
            }
        }
    }

    removeSelectionBox() {
        if (this.selectionBox) {
            document.body.removeChild(this.selectionBox);
            this.selectionBox = null;
        }
    }

    performBoxSelection(endX, endY, add) {
        if (!add) this.clearSelection();

        const camera = this.editor.renderer.activeCamera || this.editor.renderer.camera;

        if (this.selectionMode === 'rectangle') {
            const startX = this.selectionStart.x;
            const startY = this.selectionStart.y;
            const minX = Math.min(startX, endX);
            const maxX = Math.max(startX, endX);
            const minY = Math.min(startY, endY);
            const maxY = Math.max(startY, endY);

            this.editor.molecule.atoms.forEach(atom => {
                if (!atom.mesh) return;

                const pos = atom.mesh.position.clone();
                pos.project(camera);

                const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
                const screenY = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

                if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                    this.selectAtom(atom, true);
                }
            });
        } else if (this.selectionMode === 'lasso') {
            if (this.lassoPath.length < 3) return;

            this.editor.molecule.atoms.forEach(atom => {
                if (!atom.mesh) return;

                const pos = atom.mesh.position.clone();
                pos.project(camera);

                const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
                const screenY = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

                if (this.isPointInPolygon(screenX, screenY, this.lassoPath)) {
                    this.selectAtom(atom, true);
                }
            });
        }
    }

    isPointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}
