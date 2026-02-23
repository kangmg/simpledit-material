import { ErrorHandler } from '../utils/errorHandler.js';

/**
 * Manages RDKit WASM instance and provides wrapper methods
 */
export class RDKitManager {
    constructor() {
        this.rdkit = null;
        this.isLoading = false;
        this.initPromise = null;
    }

    /**
     * Initialize RDKit module
     * @returns {Promise<Object>} RDKit module
     */
    async load() {
        if (this.rdkit) return this.rdkit;
        if (this.initPromise) return this.initPromise;

        this.isLoading = true;
        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                // Wait for global initRDKitModule to be available
                // It's loaded via script tag in index.html
                let attempts = 0;
                const maxAttempts = 50; // 5 seconds max

                while (!window.initRDKitModule && attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }

                if (!window.initRDKitModule) {
                    throw new Error('RDKit script not loaded. Make sure RDKit_minimal.js is included in index.html');
                }

                console.log('Initializing RDKit...');
                const instance = await window.initRDKitModule();
                this.rdkit = instance;
                this.isLoading = false;
                console.log('RDKit loaded successfully');
                resolve(instance);
            } catch (err) {
                this.isLoading = false;
                console.error('Failed to load RDKit:', err);
                reject(err);
            }
        });

        return this.initPromise;
    }

    /**
     * Get RDKit instance, loading if necessary
     */
    async getInstance() {
        if (!this.rdkit) {
            await this.load();
        }
        return this.rdkit;
    }

    /**
     * Convert SMILES to MolBlock (V3000) with 3D coordinates
     * @param {string} smiles 
     * @param {Object} options
     * @param {boolean} [options.addHydrogens=true] - Whether to add hydrogen atoms
     * @returns {Promise<string>} MolBlock
     */
    async smilesToMolBlock(smiles, options = {}) {
        const { addHydrogens = false } = options; // Default false - RDKit minimal doesn't support add_hs properly
        const rdkit = await this.getInstance();
        const mol = rdkit.get_mol(smiles);

        if (!mol) {
            throw new Error('Invalid SMILES');
        }

        try {
            // Note: RDKit minimal build doesn't support add_hs()
            // For hydrogen addition, would need full RDKit build
            if (addHydrogens) {
                console.warn('Hydrogen addition not supported in RDKit minimal build');
            }

            // Try different method names for adding 2D coordinates
            if (typeof mol.set_2d_coords === 'function') {
                mol.set_2d_coords();
            } else if (typeof mol.generate_2d_coords === 'function') {
                mol.generate_2d_coords();
            } else if (typeof mol.set2DCoords === 'function') {
                mol.set2DCoords();
            } else {
                console.warn('No 2D coordinate generation method found, using default coordinates');
            }

            const molBlock = mol.get_molblock();
            return molBlock;
        } finally {
            mol.delete();
        }
    }

    /**
     * Generate 2D SVG for a molecule
     * @param {string} smiles 
     * @param {number} width 
     * @param {number} height 
     * @returns {Promise<string>} SVG string
     */
    async getSVG(smiles, width = 400, height = 300) {
        const rdkit = await this.getInstance();
        const mol = rdkit.get_mol(smiles);

        if (!mol) return '';

        try {
            return mol.get_svg(width, height);
        } finally {
            mol.delete();
        }
    }

    /**
     * Convert MolBlock to SMILES
     * @param {string} molBlock 
     * @returns {Promise<string>} SMILES
     */
    async molBlockToSmiles(molBlock) {
        const rdkit = await this.getInstance();
        const mol = rdkit.get_mol(molBlock);

        if (!mol) return '';

        try {
            return mol.get_smiles();
        } finally {
            mol.delete();
        }
    }
}

export const rdkitManager = new RDKitManager();
