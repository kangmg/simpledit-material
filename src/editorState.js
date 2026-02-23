/**
 * Centralized state management for Editor
 * Consolidates UI settings, selection state, and manipulation mode
 */
export class EditorState {
    constructor() {
        // UI State
        this.ui = {
            labelMode: 'none',           // 'none' | 'symbol' | 'number' | 'both'
            cameraMode: 'orbit',         // 'orbit' | 'trackball'
            projectionMode: 'perspective', // 'perspective' | 'orthographic'
            colorScheme: 'jmol',         // 'jmol' | 'cpk'
        };

        // Selection State
        this.selection = {
            order: [],                   // Array of selected atoms for geometry operations
            highlighted: new Set(),      // Set of atom indices with selection highlight
        };

        // Clipboard (managed by MoleculeManager but tracked here)
        this.clipboard = null;

        // Manipulation Mode
        this.mode = 'edit';             // 'edit' | 'select' | 'move'
    }

    // UI Getters/Setters with validation
    setLabelMode(mode) {
        const validModes = ['none', 'symbol', 'number', 'both'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid label mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
        }
        this.ui.labelMode = mode;
    }

    getLabelMode() {
        return this.ui.labelMode;
    }

    cycleLabelMode() {
        const modes = ['none', 'symbol', 'number', 'both'];
        const current = modes.indexOf(this.ui.labelMode);
        this.ui.labelMode = modes[(current + 1) % modes.length];
        return this.ui.labelMode;
    }

    setCameraMode(mode) {
        const validModes = ['orbit', 'trackball'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid camera mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
        }
        this.ui.cameraMode = mode;
    }

    setProjectionMode(mode) {
        const validModes = ['perspective', 'orthographic'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid projection mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
        }
        this.ui.projectionMode = mode;
    }

    setColorScheme(scheme) {
        const validSchemes = ['jmol', 'cpk'];
        if (!validSchemes.includes(scheme)) {
            throw new Error(`Invalid color scheme: ${scheme}. Must be one of: ${validSchemes.join(', ')}`);
        }
        this.ui.colorScheme = scheme;
    }

    // Mode Getters/Setters
    setMode(mode) {
        const validModes = ['edit', 'select', 'move'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
        }
        this.mode = mode;
    }

    getMode() {
        return this.mode;
    }

    isEditMode() {
        return this.mode === 'edit';
    }

    isSelectMode() {
        return this.mode === 'select';
    }

    isMoveMode() {
        return this.mode === 'move';
    }

    // Selection Helpers
    clearSelection() {
        this.selection.order = [];
        this.selection.highlighted.clear();
    }

    addToSelection(atomIndex, atom) {
        if (!this.selection.highlighted.has(atomIndex)) {
            this.selection.order.push(atom);
            this.selection.highlighted.add(atomIndex);
        }
    }

    removeFromSelection(atomIndex, atom) {
        // Remove from highlighted set
        this.selection.highlighted.delete(atomIndex);

        // Remove from order array
        if (atom) {
            const index = this.selection.order.indexOf(atom);
            if (index !== -1) {
                this.selection.order.splice(index, 1);
            }
        } else {
            // Fallback if atom not provided (should not happen with updated SelectionManager)
            const index = this.selection.order.findIndex(a => a.index === atomIndex);
            if (index !== -1) {
                this.selection.order.splice(index, 1);
            }
        }
    }

    isSelected(atomIndex) {
        return this.selection.highlighted.has(atomIndex);
    }

    getSelectionCount() {
        return this.selection.highlighted.size;
    }

    getSelectionOrder() {
        return this.selection.order;
    }

    // Clone state for undo/redo
    clone() {
        const cloned = new EditorState();
        cloned.ui = { ...this.ui };
        cloned.selection = {
            order: [...this.selection.order],
            highlighted: new Set(this.selection.highlighted),
        };
        cloned.clipboard = this.clipboard; // Shallow copy
        cloned.mode = this.mode;
        return cloned;
    }
}
