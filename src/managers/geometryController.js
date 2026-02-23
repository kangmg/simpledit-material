import { GeometryEngine } from '../geometryEngine.js';
import { ErrorHandler } from '../utils/errorHandler.js';

/**
 * Controls geometry manipulation sliders and operations
 * Handles bond length, angle, and dihedral adjustments
 */
export class GeometryController {
    constructor(editor) {
        this.editor = editor;
        this.state = editor.state;
    }

    /**
     * Bind geometry slider events
     */
    bindGeometrySliders() {
        this.bindBondLengthSlider();
        this.bindAngleSlider();
        this.bindDihedralSlider();
    }

    /**
     * Bind bond length slider
     */
    /**
     * Bind bond length slider and input
     */
    bindBondLengthSlider() {
        const slider = document.getElementById('input-length');
        const input = document.getElementById('val-length');

        if (slider && input) {
            // Slider Interaction
            // slider.onmousedown = () => this.editor.saveState(); // Removed: Save after drag

            slider.oninput = () => {
                input.value = slider.value;
                this.setBondLength(parseFloat(slider.value), false); // Don't save during drag
            };

            slider.onchange = () => {
                this.setBondLength(parseFloat(slider.value), false); // Finalize
                this.editor.saveState(); // Save after drag release
            };

            // Number Input Interaction
            input.onchange = () => {
                // this.editor.saveState(); // Removed: setBondLength will save if saveHistory=true (default)
                slider.value = input.value;
                this.setBondLength(parseFloat(input.value), true); // Save state for manual entry
            };
        }
    }

    /**
     * Bind angle slider and input
     */
    bindAngleSlider() {
        const slider = document.getElementById('input-angle');
        const input = document.getElementById('val-angle');

        if (slider && input) {
            // slider.onmousedown = () => this.editor.saveState(); // Removed

            slider.oninput = () => {
                input.value = slider.value;
                this.setAngle(parseFloat(slider.value), false);
            };

            slider.onchange = () => {
                this.setAngle(parseFloat(slider.value), false);
                this.editor.saveState(); // Save after drag
            };

            input.onchange = () => {
                // this.editor.saveState(); // Removed
                slider.value = input.value;
                this.setAngle(parseFloat(input.value), true);
            };
        }
    }

    /**
     * Bind dihedral slider and input
     */
    bindDihedralSlider() {
        const slider = document.getElementById('input-dihedral');
        const input = document.getElementById('val-dihedral');

        if (slider && input) {
            // slider.onmousedown = () => this.editor.saveState(); // Removed

            slider.oninput = () => {
                input.value = slider.value;
                this.setDihedral(parseFloat(slider.value), false);
            };

            slider.onchange = () => {
                this.setDihedral(parseFloat(slider.value), false);
                this.editor.saveState(); // Save after drag
            };

            input.onchange = () => {
                // this.editor.saveState(); // Removed
                slider.value = input.value;
                this.setDihedral(parseFloat(input.value), true);
            };
        }
    }

    /**
     * Set bond length between two selected atoms
     * @param {number} targetDist - Target distance in Angstroms
     * @param {boolean} saveHistory - Whether to save state to undo history
     * @returns {Object} Result object
     */
    setBondLength(targetDist, saveHistory = true) {
        const selectionOrder = this.state.getSelectionOrder();

        if (selectionOrder.length !== 2) {
            return ErrorHandler.error('Select exactly 2 atoms for bond length adjustment');
        }

        const validation = ErrorHandler.validatePositive(targetDist, 'distance');
        if (validation) return validation;

        const [a1, a2] = selectionOrder;

        // Find fragment to move
        const fragmentToMove = this.getMovingFragment(a1, a2);
        const movingAtomPositions = Array.from(fragmentToMove).map(atom => atom.position.clone());

        // Calculate new positions
        const newPositions = GeometryEngine.getNewPositionsForBondLength(
            a1.position,
            a2.position,
            movingAtomPositions,
            targetDist
        );

        // Apply new positions
        Array.from(fragmentToMove).forEach((atom, i) => {
            atom.position.copy(newPositions[i]);
            this.editor.renderManager.updateAtomVisuals(atom);
        });

        this.editor.renderManager.updateBondVisuals();
        this.editor.uiManager.updateLabelPositions();

        if (saveHistory) {
            this.editor.saveState();
        }

        return ErrorHandler.success(`Bond length set to ${targetDist.toFixed(2)} Å`);
    }

    /**
     * Set angle between three selected atoms
     * @param {number} targetAngle - Target angle in degrees
     * @param {boolean} saveHistory - Whether to save state to undo history
     * @returns {Object} Result object
     */
    setAngle(targetAngle, saveHistory = true) {
        const selectionOrder = this.state.getSelectionOrder();

        if (selectionOrder.length !== 3) {
            return ErrorHandler.error('Select exactly 3 atoms for angle adjustment');
        }

        const validation = ErrorHandler.validateNumber(targetAngle, 'angle');
        if (validation) return validation;

        const [a1, pivot, a3] = selectionOrder;

        // Find fragment to move
        const fragmentToMove = this.getMovingFragment(pivot, a3);
        const movingAtomPositions = Array.from(fragmentToMove).map(atom => atom.position.clone());

        // Calculate new positions
        const newPositions = GeometryEngine.getNewPositionsForAngle(
            a1.position,
            pivot.position,
            a3.position,
            movingAtomPositions,
            targetAngle
        );

        // Apply new positions
        Array.from(fragmentToMove).forEach((atom, i) => {
            atom.position.copy(newPositions[i]);
            this.editor.renderManager.updateAtomVisuals(atom);
        });

        this.editor.renderManager.updateBondVisuals();
        this.editor.uiManager.updateLabelPositions();

        if (saveHistory) {
            this.editor.saveState();
        }

        return ErrorHandler.success(`Angle set to ${targetAngle.toFixed(1)}°`);
    }

    /**
     * Set dihedral angle between four selected atoms
     * @param {number} targetAngle - Target dihedral in degrees
     * @param {boolean} saveHistory - Whether to save state to undo history
     * @returns {Object} Result object
     */
    setDihedral(targetAngle, saveHistory = true) {
        const selectionOrder = this.state.getSelectionOrder();

        if (selectionOrder.length !== 4) {
            return ErrorHandler.error('Select exactly 4 atoms for dihedral adjustment');
        }

        const validation = ErrorHandler.validateNumber(targetAngle, 'dihedral');
        if (validation) return validation;

        const [a1, a2, a3, a4] = selectionOrder;

        // Find fragment to move for dihedral rotation
        // For dihedral, we rotate atoms BEYOND a3, not including a3 itself
        // a2-a3 is the rotation axis, so both a2 and a3 must remain fixed
        const fragmentToMove = this.getMovingFragmentForDihedral(a2, a3, [a1]);

        // CRITICAL: If a4 is not in the moving fragment, we have a problem
        if (!fragmentToMove.has(a4)) {
            return ErrorHandler.error('Invalid dihedral selection: atoms are not properly connected');
        }

        const movingAtomPositions = Array.from(fragmentToMove).map(atom => atom.position.clone());

        // Calculate current dihedral BEFORE rotation
        const currentDihedral = GeometryEngine.calculateDihedral(a1.position, a2.position, a3.position, a4.position);
        const delta = targetAngle - currentDihedral;

        // Calculate new positions
        const newPositions = GeometryEngine.getNewPositionsForDihedral(
            a1.position,
            a2.position,
            a3.position,
            a4.position,
            movingAtomPositions,
            targetAngle
        );

        // Apply new positions
        Array.from(fragmentToMove).forEach((atom, i) => {
            atom.position.copy(newPositions[i]);
            this.editor.renderManager.updateAtomVisuals(atom);
        });

        this.editor.renderManager.updateBondVisuals();
        this.editor.uiManager.updateLabelPositions();

        // Calculate dihedral AFTER rotation to verify
        const newDihedral = GeometryEngine.calculateDihedral(a1.position, a2.position, a3.position, a4.position);

        if (saveHistory) {
            this.editor.saveState();
        }

        return ErrorHandler.success(`Dihedral set to ${targetAngle.toFixed(1)}°`);
    }

    /**
     * Get moving fragment specifically for dihedral rotation
     * This version starts BFS from neighbors of axisEnd, not from axisEnd itself
     * @param {Object} axisStart - Start of rotation axis (e.g., a2)
     * @param {Object} axisEnd - End of rotation axis (e.g., a3) - this atom stays fixed
     * @param {Array} excludeAtoms - Additional atoms to exclude (e.g., a1)
     * @returns {Set} Set of atoms to move (excludes axisEnd)
     */
    getMovingFragmentForDihedral(axisStart, axisEnd, excludeAtoms = []) {
        const visited = new Set();
        const toMove = new Set();
        const queue = [];

        // Mark axis atoms and excluded atoms as visited
        visited.add(axisStart);
        visited.add(axisEnd); // CRITICAL: axisEnd must not move
        excludeAtoms.forEach(atom => visited.add(atom));

        // Start BFS from neighbors of axisEnd (excluding axisStart)
        if (axisEnd.bonds) {
            for (const bond of axisEnd.bonds) {
                const neighbor = bond.atom1 === axisEnd ? bond.atom2 : bond.atom1;
                if (!visited.has(neighbor)) {
                    queue.push(neighbor);
                }
            }
        }

        // BFS traversal
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;

            visited.add(current);
            toMove.add(current);

            // Find connected atoms using atom.bonds
            if (current.bonds) {
                for (const bond of current.bonds) {
                    const neighbor = bond.atom1 === current ? bond.atom2 : bond.atom1;
                    if (!visited.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }
        }

        return toMove;
    }

    /**
     * Get moving fragment for geometry operation
     * @param {Object} pivot - Pivot atom
     * @param {Object} direction - Direction atom
     * @param {Array} excludeAtoms - Additional atoms to exclude
     * @returns {Set} Set of atoms to move
     */
    getMovingFragment(pivot, direction, excludeAtoms = []) {
        const visited = new Set();
        const toMove = new Set();
        const queue = [direction];

        // Mark pivot and excluded atoms as visited
        visited.add(pivot);
        excludeAtoms.forEach(atom => visited.add(atom));

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;

            visited.add(current);
            toMove.add(current);

            // Find connected atoms using atom.bonds
            if (current.bonds) {
                for (const bond of current.bonds) {
                    const neighbor = bond.atom1 === current ? bond.atom2 : bond.atom1;
                    if (!visited.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }
        }

        return toMove;
    }
}
