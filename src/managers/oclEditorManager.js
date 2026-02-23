import OCL from 'openchemlib';

/**
 * Manages OpenChemLib 2D Editor instance
 */
export class OCLEditorManager {
    constructor() {
        this.editor = null;
        this.containerId = null;
        this.isInitialized = false;
    }

    /**
     * Initialize OCL Editor in the specified container
     * @param {string} containerId 
     */
    init(containerId) {
        if (this.isInitialized && this.containerId === containerId) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const container = document.getElementById(containerId);
            if (!container) {
                console.error(`Container ${containerId} not found`);
                reject(new Error(`Container ${containerId} not found`));
                return;
            }

            this.containerId = containerId;

            // Initialize OCL CanvasEditor
            try {
                this.editor = new OCL.CanvasEditor(container);
                this.isInitialized = true;
                console.log('OCL Editor initialized');
                resolve();
            } catch (error) {
                console.error('Failed to initialize OCL Editor:', error);
                reject(error);
            }
        });
    }

    /**
     * Set molecule from MolBlock
     * @param {string} molBlock 
     */
    /**
     * Set molecule from MolBlock
     * @param {string} molBlock 
     */
    setMol(molBlock) {
        if (!this.editor) return;

        // Skip if empty or whitespace only
        if (!molBlock || molBlock.trim() === '') {
            console.log('[OCL Editor] Clearing editor (empty input)');
            this.editor.setMolecule(new OCL.Molecule(0, 0));
            return;
        }

        try {
            const mol = OCL.Molecule.fromMolfile(molBlock);
            // Auto-layout (clean up) to center and arrange atoms nicely
            mol.inventCoordinates();
            this.editor.setMolecule(mol);
        } catch (error) {
            console.error('Failed to set molecule in OCL Editor:', error);
        }
    }

    /**
     * Get MolBlock from editor
     * @returns {string|null} MolBlock
     */
    getMol() {
        if (!this.editor) return null;
        try {
            const mol = this.editor.getMolecule();
            return mol.toMolfile();
        } catch (error) {
            console.error('Failed to get molecule from OCL Editor:', error);
            return null;
        }
    }
}

export const oclEditorManager = new OCLEditorManager();
