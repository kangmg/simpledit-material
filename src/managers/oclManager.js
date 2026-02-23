import OCL from 'openchemlib';

/**
 * Manages OpenChemLib operations for 3D generation and hydrogen addition
 */
export class OCLManager {
    constructor() {
        this.isInitialized = false;
        this.initPromise = null;
    }

    /**
     * Initialize OCL resources
     */
    async init() {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                // Register static resources (force field data, etc.)
                await OCL.Resources.registerFromUrl('./lib/openchemlib/resources.json');
                this.isInitialized = true;
                console.log('OCL Resources initialized');
            } catch (error) {
                console.error('Failed to initialize OCL resources:', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * Generate 3D coordinates for a SMILES string or Molecule object
     * @param {string|OCL.Molecule} input - SMILES string or OCL Molecule
     * @returns {Promise<OCL.Molecule>} 3D Molecule object
     */
    async generate3D(input) {
        await this.init();
        try {
            // Accept both SMILES string and Molecule object
            let mol;
            if (typeof input === 'string') {
                mol = OCL.Molecule.fromSmiles(input);
            } else {
                mol = input; // Already a Molecule object
            }

            // Add hydrogens first (implicit -> explicit for 3D)
            mol.addImplicitHydrogens();

            // Generate 3D conformer
            const generator = new OCL.ConformerGenerator(42);
            const conformer = generator.getOneConformerAsMolecule(mol);

            if (!conformer) {
                throw new Error('Conformer generation failed');
            }

            return conformer; // Return Molecule object, not string
        } catch (error) {
            console.error('OCL 3D Generation failed:', error);
            throw error;
        }
    }

    /**
     * Convert MolBlock to SMILES
     * @param {string} molBlock 
     * @returns {Promise<string>} SMILES string
     */
    async molBlockToSmiles(molBlock) {
        await this.init();
        try {
            const mol = OCL.Molecule.fromMolfile(molBlock);
            return mol.toSmiles();
        } catch (error) {
            console.error('OCL MolBlock to SMILES failed:', error);
            throw error;
        }
    }

    /**
     * Add hydrogens to a SMILES string (2D)
     * @param {string} smiles 
     * @returns {Promise<string>} MolBlock (V2000)
     */
    async addHydrogens(smiles) {
        // addHydrogens might not need resources, but safer to init
        await this.init();
        try {
            const mol = OCL.Molecule.fromSmiles(smiles);
            mol.addImplicitHydrogens();
            return mol.toMolfile();
        } catch (error) {
            console.error('OCL Add Hydrogens failed:', error);
            throw error;
        }
    }
}

export const oclManager = new OCLManager();
