import * as THREE from 'three';
import { ErrorHandler } from '../utils/errorHandler.js';
import { oclManager } from './oclManager.js';
import { rdkitManager } from './rdkitManager.js';
import OCL from 'openchemlib';

/**
 * Manages file import/export operations
 * Handles XYZ, SMILES, SDF formats and coordinate conversions
 */
export class FileIOManager {
    constructor(editor) {
        this.editor = editor;
        this.fileInput = document.getElementById('file-input');
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    }

    resetMolecules() {
        const mm = this.editor.moleculeManager;
        // Remove all molecules starting from the last one, down to index 1
        while (mm.molecules.length > 1) {
            mm.removeMolecule(mm.molecules.length - 1);
        }
        // Reset the remaining one
        mm.switchMolecule(0);
        this.editor.molecule.clear();
        mm.renameMolecule(0, "Molecule 1");
    }

    async processInitialArgs(args) {
        for (const arg of args) {
            await this.loadLocalFile(arg);
        }
    }

    async loadLocalFile(path) {
        try {
            const content = await this.readLocalFile(path);
            const ext = path.split('.').pop().toLowerCase();

            if (ext === 'inp') {
                await this.runScript(content);
            } else if (['xyz', 'sdf', 'mol', 'smi'].includes(ext)) {
                this.loadContent(content, ext);
                console.log(`Loaded file: ${path}`);
            } else {
                throw new Error(`Unsupported file extension: ${ext}`);
            }
        } catch (error) {
            console.error(`Error loading file ${path}:`, error);
            throw error;
        }
    }

    loadContent(content, ext) {
        switch (ext) {
            case 'xyz':
                this.importXYZ(content);
                break;
            case 'sdf':
            case 'mol':
                this.importSDF(content);
                break;
            case 'smi':
                this.importSMILES(content);
                break;
            default:
                throw new Error(`Unsupported file extension: ${ext}`);
        }
    }

    async readLocalFile(path) {
        const response = await fetch(`/api/read?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to read file');
        }
        const data = await response.json();
        return data.content;
    }

    async runScript(content) {
        const lines = content.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                console.log(`Executing: ${line}`);
                await this.editor.console.execute(line);
            }
        }
    }

    // ... (skipping unchanged parts)

    /**
     * Import SMILES string
     * @param {string} smiles 
     * @param {Object} options 
     * @param {boolean} [options.shouldClear=true]
     * @param {boolean} [options.autoBond=false]
     * @param {boolean} [options.generate3D=false] - Use OpenChemLib to generate 3D coordinates
     * @param {boolean} [options.addHydrogens=false] - Use OpenChemLib to add explicit hydrogens
     */
    async importSMILES(content, options = {}) {
        const { shouldClear = true, autoBond = false, generate3D = false, addHydrogens = false } = options;

        try {
            // Split by newline to handle multiple SMILES
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            if (lines.length === 0) return;

            if (shouldClear) {
                this.resetMolecules();
            }

            console.log(`[ImportSMILES] Processing ${lines.length} lines`);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Parse SMILES and Name: "SMILES Name" or just "SMILES"
                const parts = line.split(/\s+/);
                const smiles = parts[0];
                const name = parts.length > 1 ? parts.slice(1).join(' ') : `Molecule ${this.editor.moleculeManager.molecules.length + 1}`;

                if (i > 0 || !shouldClear) {
                    console.log(`[ImportSMILES] Creating new molecule: ${name}`);
                    this.editor.moleculeManager.createMolecule(name);
                } else {
                    // First molecule (already reset), just rename
                    if (parts.length > 1) {
                        console.log(`[ImportSMILES] Renaming first molecule: ${name}`);
                        this.editor.moleculeManager.renameMolecule(0, name);
                    }
                }

                await this.importSingleSMILES(smiles, { shouldClear: true, autoBond, generate3D, addHydrogens });
            }

            this.editor.moleculeManager.updateUI();
            return ErrorHandler.success(`Imported ${lines.length} molecules from SMILES`);

        } catch (error) {
            ErrorHandler.logError('FileIOManager.importSMILES', error);
            return ErrorHandler.error('Failed to import SMILES', error.message);
        }
    }

    async importSingleSMILES(smiles, options) {
        const { shouldClear, autoBond, generate3D, addHydrogens } = options;
        let molBlock;

        // Strategy for Dummy Atoms with Hydrogens:
        // OCL treats '*' as 'Any' (valence 0/unknown), so it doesn't add hydrogens to neighbors correctly.
        // We temporarily replace '*' with '[2H]' (Deuterium, valence 1) to force correct valence.
        // Then we post-process the MolBlock to turn Deuterium back into 'X' (Dummy).
        let processingSmiles = smiles;
        let usedDeuteriumTrick = false;

        if (addHydrogens && smiles.includes('*')) {
            processingSmiles = smiles.replace(/\[\*\]/g, '[2H]').replace(/\*/g, '[2H]');
            usedDeuteriumTrick = true;
        }

        if (generate3D) {
            // Use OCL for 3D generation (implies explicit hydrogens)
            const mol3D = await oclManager.generate3D(processingSmiles);
            molBlock = mol3D.toMolfile();
        } else if (addHydrogens) {
            // Use OCL for explicit hydrogens (2D)
            molBlock = await oclManager.addHydrogens(processingSmiles);
        } else {
            // Use OCL for standard 2D (implicit hydrogens) - Replaces RDKit
            // This ensures consistent behavior across all SMILES imports
            // Fallback to RDKit if OCL fails (e.g. aromaticity issues)
            try {
                const mol = OCL.Molecule.fromSmiles(processingSmiles);
                molBlock = mol.toMolfile();
            } catch (e) {
                console.warn('[importSMILES] OCL failed, trying RDKit fallback:', e);
                try {
                    molBlock = await rdkitManager.smilesToMolBlock(processingSmiles);
                } catch (rdkitError) {
                    console.error('[importSMILES] RDKit fallback failed:', rdkitError);
                    throw e; // Throw original OCL error as it's likely more relevant
                }
            }
        }

        // Post-process MolBlock
        if (molBlock) {
            // 1. Fix Deuterium Trick (convert [2H] back to X)
            if (usedDeuteriumTrick) {
                molBlock = this.convertDeuteriumToDummy(molBlock);
            }

            // 2. Standard Dummy Atom Fix (Replace "A" with "X")
            // OCL converts "*" in SMILES to "A" in Molfile (if we didn't use the trick).
            molBlock = molBlock.replace(/^(\s+[0-9.-]+\s+[0-9.-]+\s+[0-9.-]+\s+)A(\s+)/gm, '$1X$2');
        }

        // Import the generated MolBlock (SDF/Mol format)
        return this.importSingleSDF(molBlock, { shouldClear, autoBond });
    }

    /**
     * Update current molecule from MolBlock, preserving 3D coordinates if possible
     * @param {string} molBlock 
     */
    /**
     * Update molecule from 2D editor MolBlock
     * Generates fresh 3D coordinates as per user request.
     * @param {string} molBlock - V2000 MolBlock from JSME/OCL
     */
    async updateFromMolBlock(molBlock) {
        try {
            // Ensure OCL resources are initialized
            await oclManager.init();

            // Strategy for Dummy Atoms with Hydrogens (Fluorine Placeholder + Index Reversion)
            // User requested: Replace Dummy with Fluorine (AtomicNo 9) -> Add Hydrogens -> Revert by Index
            // Fluorine is monovalent (Valence 1) like            // 1. Pre-process MolBlock: Substitute '*' with 'F' in the string directly
            // This ensures OCL parses them as Fluorine initially, allowing correct implicit hydrogen calculation.
            const dummyIndices = [];
            const molLines = molBlock.split('\n');

            // Find Atom Count Line (V2000)
            // Look for line ending with V2000 or just the counts line (4th line usually)
            // But to be safe, we look for the counts line pattern.
            // Standard: 3 header lines, then counts line.
            // Counts line: aa bb ... V2000
            let atomCountLineIdx = -1;
            for (let i = 0; i < molLines.length; i++) {
                if (molLines[i].includes('V2000')) {
                    atomCountLineIdx = i;
                    break;
                }
            }

            if (atomCountLineIdx === -1) {
                // Fallback: assume line 3 (0-based) if V2000 tag missing (rare but possible in loose formats)
                atomCountLineIdx = 3;
            }

            let atomCount = 0;
            if (molLines[atomCountLineIdx]) {
                const parts = molLines[atomCountLineIdx].trim().split(/\s+/);
                atomCount = parseInt(parts[0]);
            }

            const startIdx = atomCountLineIdx + 1;

            for (let i = 0; i < atomCount; i++) {
                const line = molLines[startIdx + i];
                if (!line) continue;

                // V2000: Symbol is at columns 31-33 (1-based in spec, so 30-33 in 0-based string?)
                // Spec: x(10)y(10)z(10) (space) symbol(3)
                // 0-9: x, 10-19: y, 20-29: z, 30: space, 31-33: symbol
                // Let's be flexible and just check the substring or regex the line.
                // But replacing by index is safest to avoid touching other fields.

                // Check if line is long enough
                if (line.length >= 34) {
                    const symbol = line.substring(31, 34).trim();
                    // OCL might export '?' (AtomicNo 0) or 'A' (Any) or '*'
                    if (['*', '?', 'A', 'X', 'Q'].includes(symbol)) {
                        dummyIndices.push(i);
                        console.log(`[updateFromMolBlock] Found Dummy '${symbol}' at index ${i} in MolBlock string. Replacing with 'C'.`);
                        // Replace with 'C  ' (C + 2 spaces) to maintain alignment. 
                        // We use Carbon (Valence 4) to support dummies with multiple connections (up to 4).
                        molLines[startIdx + i] = line.substring(0, 31) + 'C  ' + line.substring(34);
                    }
                } else {
                    // Loose format handling
                    const parts = line.trim().split(/\s+/);
                    const symbol = parts[3];
                    if (['*', '?', 'A', 'X', 'Q'].includes(symbol)) {
                        dummyIndices.push(i);
                        console.log(`[updateFromMolBlock] Found Dummy '${symbol}' (loose format) at index ${i}. Replacing with 'C'.`);
                        molLines[startIdx + i] = line.replace(symbol, 'C');
                    }
                }
            }

            const processingMolBlock = molLines.join('\n');

            // 2. Parse the modified MolBlock
            let mol = OCL.Molecule.fromMolfile(processingMolBlock);
            console.log(`[updateFromMolBlock] Total atoms after parsing: ${mol.getAllAtoms()}`);

            // Verify substitution
            dummyIndices.forEach(idx => {
                if (mol.getAtomicNo(idx) !== 6) {
                    console.warn(`[updateFromMolBlock] Warning: Index ${idx} is not Carbon after parsing! (AtomicNo: ${mol.getAtomicNo(idx)})`);
                }
            });

            // 3. Add implicit hydrogens BEFORE 3D generation
            console.log('[updateFromMolBlock] Adding implicit hydrogens BEFORE 3D generation...');
            mol.addImplicitHydrogens();
            console.log(`[updateFromMolBlock] After H addition: ${mol.getAllAtoms()} atoms`);

            // Print all atoms for debugging
            for (let i = 0; i < mol.getAllAtoms(); i++) {
                console.log(`  Atom ${i}: AtomicNo=${mol.getAtomicNo(i)}, Label=${mol.getAtomLabel(i)}`);
            }

            // 4. Generate fresh 3D coordinates
            // IMPORTANT: We use ConformerGenerator DIRECTLY instead of oclManager.generate3D()
            // because generate3D() calls addImplicitHydrogens() again, which would duplicate hydrogens!
            console.log('[updateFromMolBlock] Calling ConformerGenerator directly...');

            const generator = new OCL.ConformerGenerator(42);
            const mol3D = generator.getOneConformerAsMolecule(mol);

            if (!mol3D) {
                throw new Error('Conformer generation failed');
            }

            console.log(`[updateFromMolBlock] 3D generation complete. Total atoms: ${mol3D.getAllAtoms()}`);

            // Print all atoms after 3D for debugging
            for (let i = 0; i < mol3D.getAllAtoms(); i++) {
                console.log(`  Atom ${i}: AtomicNo=${mol3D.getAtomicNo(i)}, Label=${mol3D.getAtomLabel(i)}`);
            }

            // 5. Post-process: Restore Dummies and Remove Excess Hydrogens
            if (dummyIndices.length > 0) {
                console.log('[updateFromMolBlock] Reverting Carbon to Dummy and cleaning up hydrogens...');
                const atomsToDelete = [];

                dummyIndices.forEach(idx => {
                    // Check if it's likely our substituted Carbon
                    if (mol3D.getAtomicNo(idx) === 6) {
                        mol3D.setAtomicNo(idx, 0);
                        // OCL uses '?' for AtomicNo 0.
                        console.log(`[updateFromMolBlock] Reverted index ${idx} to Dummy`);

                        // Find hydrogens attached to this dummy (which were added because we pretended it was Carbon)
                        // and mark them for deletion.
                        const connCount = mol3D.getConnAtoms(idx);
                        for (let k = 0; k < connCount; k++) {
                            const neighborIdx = mol3D.getConnAtom(idx, k);
                            if (mol3D.getAtomicNo(neighborIdx) === 1) {
                                atomsToDelete.push(neighborIdx);
                            }
                        }
                    } else {
                        console.warn(`[updateFromMolBlock] Index ${idx} not Carbon after 3D (found ${mol3D.getAtomicNo(idx)})`);
                    }
                });

                // Delete atoms (sort descending to preserve indices during deletion)
                if (atomsToDelete.length > 0) {
                    const uniqueToDelete = [...new Set(atomsToDelete)].sort((a, b) => b - a);
                    console.log(`[updateFromMolBlock] Removing ${uniqueToDelete.length} excess hydrogens attached to dummies...`);
                    uniqueToDelete.forEach(delIdx => {
                        mol3D.deleteAtom(delIdx);
                    });
                }
            }

            // 6. Import to editor - only update current molecule, not all
            let newMolBlock = mol3D.toMolfile();

            // Standardize Dummy Atoms (A/? -> *) for export consistency
            newMolBlock = newMolBlock.replace(/^(\s+[0-9.-]+\s+[0-9.-]+\s+[0-9.-]+\s+)[?A](\s+)/gm, '$1*$2');

            console.log('[updateFromMolBlock] Generated MolBlock:', newMolBlock);

            this.editor.molecule.clear();  // Clear only current molecule
            return this.importSingleSDF(newMolBlock, {
                shouldClear: false,  // Already cleared above
                autoBond: false // SDF has bonds
            });

        } catch (error) {
            console.error('Error updating from MolBlock:', error);
            return { error: error.message };
        }
    }

    /**
     * Import SDF/MolBlock string
     * @param {string} sdfString 
     * @param {Object} options 
     */
    importSDF(sdfString, options = {}) {
        const { shouldClear = true, autoBond = false } = options;

        try {
            if (typeof sdfString !== 'string') {
                console.warn('[importSDF] sdfString is not a string, attempting conversion:', sdfString);
                sdfString = String(sdfString);
            }

            // Split by $$$$
            const blocks = sdfString.split('$$$$').filter(b => b.trim().length > 0);

            if (blocks.length === 0) return;

            if (shouldClear) {
                this.resetMolecules();
            }

            blocks.forEach((block, i) => {
                // Extract name from first line
                const lines = block.split('\n');
                let name = lines[0].trim() || `Molecule ${this.editor.moleculeManager.molecules.length + 1}`;

                if (i > 0 || !shouldClear) {
                    this.editor.moleculeManager.createMolecule(name);
                } else {
                    this.editor.moleculeManager.renameMolecule(0, name);
                }

                this.importSingleSDF(block, { shouldClear: true, autoBond });
            });

            this.editor.moleculeManager.updateUI();
            return ErrorHandler.success(`Imported ${blocks.length} molecules`);

        } catch (error) {
            ErrorHandler.logError('FileIOManager.importSDF', error);
            return ErrorHandler.error('Failed to import SDF', error.message);
        }
    }

    importSingleSDF(sdfString, options = {}) {
        const { shouldClear = true, autoBond = false } = options;

        try {
            if (shouldClear) {
                this.editor.molecule.clear();
            }

            // Simple V2000/V3000 parser
            // We can use RDKit to parse, but RDKit JS doesn't easily return atom list with coords for us to iterate.
            // Actually, we can just parse the text block since standard is simple.
            // Or use RDKit to get JSON if available. 
            // Let's parse text for now as it's faster than round-trip if we just want coords.
            // V2000:
            // Counts line: aaabbb...
            // Atom block: x y z symbol...
            // Bond block: 1 2 type...

            const lines = sdfString.split('\n');
            let isV3000 = lines.some(l => l.includes('V3000'));

            if (isV3000) {
                return ErrorHandler.error('V3000 import not yet fully implemented');
            }

            // Find counts line (4th line usually, or after header)
            // Header is 3 lines.
            // Line 4: counts
            let atomCount = 0;
            let bondCount = 0;
            let atomStartIndex = 0;

            // Heuristic to find counts line: looks like "  3  2  0  0  0  0  0  0  0  0999 V2000"
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('V2000')) {
                    const parts = lines[i].trim().split(/\s+/);
                    atomCount = parseInt(parts[0]);
                    bondCount = parseInt(parts[1]);
                    atomStartIndex = i + 1;
                    break;
                }
            }

            if (atomStartIndex === 0) {
                return ErrorHandler.error('Invalid SDF/Mol format (V2000 header not found)');
            }

            const newAtoms = [];

            // Parse Atoms
            for (let i = 0; i < atomCount; i++) {
                const line = lines[atomStartIndex + i];
                const parts = line.trim().split(/\s+/);
                // V2000 atom line: x y z symbol ...
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                const z = parseFloat(parts[2]);
                let element = parts[3];

                // Standardize Dummy Atoms to 'X'
                // SDF/Molfile might use 'A', '*', '?', 'R#' for dummy/query atoms
                if (['A', '*', '?', 'X', 'R'].includes(element) || element.startsWith('R')) {
                    element = 'X';
                }

                const atom = this.editor.addAtomToScene(element, new THREE.Vector3(x, y, z));
                newAtoms.push(atom);
            }

            // Parse Bonds
            const bondStartIndex = atomStartIndex + atomCount;
            for (let i = 0; i < bondCount; i++) {
                const line = lines[bondStartIndex + i];
                const parts = line.trim().split(/\s+/);
                // V2000 bond line: 1 2 type ...
                const idx1 = parseInt(parts[0]) - 1; // 1-based to 0-based
                const idx2 = parseInt(parts[1]) - 1;
                const type = parseInt(parts[2]); // 1=Single, 2=Double, etc.

                // We treat all as single for connectivity, or store order if needed.
                // Editor currently treats all as order=1 visually usually, but stores order.
                // Let's store the order.

                if (newAtoms[idx1] && newAtoms[idx2]) {
                    this.editor.addBondToScene(newAtoms[idx1], newAtoms[idx2], 1); // Force single bond as per strategy
                }
            }

            if (autoBond) {
                this.editor.autoBond();
            }

            this.editor.rebuildScene();
            return ErrorHandler.success(`Imported ${atomCount} atoms`);

        } catch (error) {
            ErrorHandler.logError('FileIOManager.importSDF', error);
            return ErrorHandler.error('Failed to import SDF', error.message);
        }
    }

    /**
     * Export molecule as XYZ format
     * @param {Object} options
     * @param {boolean} [options.splitFragments=false]
     * @returns {string|null} XYZ format string
     */
    exportXYZ(options = {}) {
        const { splitFragments = false } = options;
        const atoms = this.editor.molecule.atoms;

        if (atoms.length === 0) return null;

        if (splitFragments) {
            const fragments = this.getFragments();
            let output = '';
            fragments.forEach(fragAtoms => {
                output += this.atomsToXYZ(fragAtoms);
            });
            return output;
        } else {
            return this.atomsToXYZ(atoms);
        }
    }

    /**
     * Helper: Convert Deuterium (H with isotope 2) to Dummy atom (X) in MolBlock
     * Used to fix hydrogen addition for dummy atoms.
     * @param {string} molBlock 
     * @returns {string} Modified MolBlock
     */
    convertDeuteriumToDummy(molBlock) {
        const lines = molBlock.split('\n');
        const deuteriumIndices = new Set();
        const isoLineIndices = [];

        // 1. Find M ISO lines and identify Deuterium (Isotope 2)
        lines.forEach((line, i) => {
            if (line.startsWith('M  ISO')) {
                isoLineIndices.push(i);
                const parts = line.trim().split(/\s+/);
                // Format: M ISO N idx1 iso1 idx2 iso2 ...
                const count = parseInt(parts[2]);
                for (let j = 0; j < count; j++) {
                    const idx = parseInt(parts[3 + j * 2]);
                    const iso = parseInt(parts[4 + j * 2]);
                    if (iso === 2) {
                        deuteriumIndices.add(idx);
                    }
                }
            }
        });

        if (deuteriumIndices.size === 0) return molBlock;

        // 2. Replace H with X for identified atoms
        // Header (3) + Counts (1) = 4 lines. Atoms start at line 4 (0-indexed).
        // Atom index is 1-based.
        let atomStartIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('V2000')) {
                atomStartIndex = i + 1;
                break;
            }
        }

        if (atomStartIndex > 0) {
            deuteriumIndices.forEach(idx => {
                const lineIdx = atomStartIndex + idx - 1;
                if (lines[lineIdx]) {
                    // Replace ' H ' with ' X '
                    // Regex to ensure we match the symbol column (approx col 31-33)
                    // Or just simple replacement if we trust the line format
                    lines[lineIdx] = lines[lineIdx].replace(/ H /, ' X ');
                }
            });
        }

        // 3. Update M ISO lines (remove Deuterium entries)
        isoLineIndices.forEach(lineIdx => {
            const line = lines[lineIdx];
            const parts = line.trim().split(/\s+/);
            const newEntries = [];
            const count = parseInt(parts[2]);

            for (let j = 0; j < count; j++) {
                const idx = parseInt(parts[3 + j * 2]);
                const iso = parseInt(parts[4 + j * 2]);
                if (iso !== 2) {
                    newEntries.push({ idx, iso });
                }
            }

            if (newEntries.length > 0) {
                // Reconstruct line
                let newLine = `M  ISO ${newEntries.length.toString().padStart(3)}`;
                newEntries.forEach(e => {
                    newLine += ` ${e.idx.toString().padStart(3)} ${e.iso.toString().padStart(3)}`;
                });
                lines[lineIdx] = newLine;
            } else {
                // Remove line if empty
                lines[lineIdx] = null;
            }
        });

        return lines.filter(l => l !== null).join('\n');
    }

    /**
     * Helper: Convert atoms to MolBlock (V2000)
     * @param {Array<Object>} atoms 
     * @param {Object} options
     * @param {boolean} [options.generate2D=false] - Generate 2D coordinates (depiction)
     * @returns {string} MolBlock string
     */
    atomsToMolBlock(atoms, options = {}) {
        const mol = this.atomsToOCL(atoms);

        if (options.generate2D) {
            console.log('[atomsToMolBlock] Generating 2D coordinates for export...');
            mol.inventCoordinates();
        }

        // Set molecule name if available (OCL doesn't have explicit setName in minimal API, 
        // but toMolfile() usually puts "Actelion..." in header. We can replace it.)
        let molBlock = mol.toMolfile();

        const name = this.editor.molecule.name || 'Molecule';
        // Replace first line (Header) with name
        // Handle potential \r\n from OCL
        const lines = molBlock.split(/\r?\n/);
        if (lines.length > 0) {
            lines[0] = name;
            if (lines.length > 1) {
                lines[1] = '  Simpledit (created by Actelion Java MolfileCreator 1.0)'; // Replace Generator line
            }
            molBlock = lines.join('\n');
        }

        // Post-process Dummy Atoms for Export
        // OCL produces '?' for AtomicNo 0, or 'A' for Query atoms.
        // User wants '*' for SDF/SMILES export.
        // Regex matches the atom symbol column (approx col 31-33 in V2000)
        // Format: xxxxx.xxxx yyyyy.yyyy zzzzz.zzzz aaa ...
        // We look for " ? " or " A " surrounded by spaces in the atom block
        molBlock = molBlock.replace(/^(\s+[0-9.-]+\s+[0-9.-]+\s+[0-9.-]+\s+)[?A](\s+)/gm, '$1*$2');

        return molBlock;
    }

    /**
     * Helper: Convert atoms to XYZ string
     * @param {Array<Object>} atoms 
     * @returns {string} XYZ string
     */
    atomsToXYZ(atoms) {
        const count = atoms.length;
        const name = this.editor.molecule.name || 'Molecule';
        let xyz = `${count}\n${name}\n`;

        atoms.forEach(atom => {
            const { x, y, z } = atom.position;
            // Format: Element (3 chars left-aligned) X (12 chars right-aligned) Y (12 chars right-aligned) Z (12 chars right-aligned)
            const el = atom.element.padEnd(3);
            const xStr = x.toFixed(6).padStart(12);
            const yStr = y.toFixed(6).padStart(12);
            const zStr = z.toFixed(6).padStart(12);
            xyz += `${el} ${xStr} ${yStr} ${zStr}\n`;
        });

        return xyz;
    }

    /**
     * Export current molecule as SMILES
     * @returns {Promise<string>} SMILES string
     */
    async exportSMILES(options = {}) {
        const { splitFragments = false, includeName = false } = options;
        const fragments = splitFragments ? this.getFragments() : [this.editor.molecule.atoms];

        const smilesList = [];

        for (const frag of fragments) {
            const molBlock = this.atomsToMolBlock(frag);
            const smi = await oclManager.molBlockToSmiles(molBlock);
            if (smi) {
                if (includeName) {
                    const name = this.editor.molecule.name || 'Molecule';
                    smilesList.push(`${smi} ${name}`);
                } else {
                    smilesList.push(smi);
                }
            }
        }

        if (splitFragments) {
            return smilesList.join('\n'); // Separate lines for separate records
        } else {
            return smilesList.join('.'); // Dot-disconnected for single record (though RDKit handles this naturally if we passed all atoms)
        }
    }

    /**
     * Export molecule as SDF
     * @param {Object} options
     * @param {boolean} [options.splitFragments=false]
     * @returns {string} SDF string
     */
    exportSDF(options = {}) {
        const { splitFragments = false } = options;
        const fragments = splitFragments ? this.getFragments() : [this.editor.molecule.atoms];

        let sdf = '';
        fragments.forEach(frag => {
            sdf += this.atomsToMolBlock(frag);
            sdf += '$$$$\n'; // SDF record separator
        });

        return sdf;
    }

    /**
     * Helper: Get disconnected fragments (arrays of atoms)
     * @returns {Array<Array<Object>>} List of atom arrays
     */
    getFragments() {
        const atoms = this.editor.molecule.atoms;
        const atomIndexMap = new Map();
        atoms.forEach((a, i) => atomIndexMap.set(a, i));

        const visited = new Set();
        const fragments = [];

        atoms.forEach(atom => {
            if (!visited.has(atom)) {
                const fragment = [];
                const stack = [atom];
                visited.add(atom);

                while (stack.length > 0) {
                    const current = stack.pop();
                    fragment.push(current);

                    current.bonds.forEach(bond => {
                        const neighbor = bond.atom1 === current ? bond.atom2 : bond.atom1;
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            stack.push(neighbor);
                        }
                    });
                }

                // Sort fragment atoms by original index to preserve order
                fragment.sort((a, b) => atomIndexMap.get(a) - atomIndexMap.get(b));

                fragments.push(fragment);
            }
        });

        return fragments;
    }

    /**
     * Helper: Convert atoms to OCL Molecule
     * @param {Array<Object>} atoms
     * @param {Object} options
     * @returns {OCL.Molecule} OCL Molecule
     */
    atomsToOCL(atoms, options = {}) {
        const mol = new OCL.Molecule(atoms.length, atoms.length); // Estimate capacity
        const atomIndexMap = new Map();

        // Add atoms
        atoms.forEach((atom, i) => {
            // Sanitize element
            let elem = atom.element || 'C';
            elem = elem.replace(/[^a-zA-Z]/g, '');
            if (elem.length === 0) elem = 'C';
            if (elem.length === 0) elem = 'C';
            if (elem === 'X') elem = '*'; // Dummy (will become AtomicNo 0 -> '?' in Molfile)

            // OCL expects atomic number or label
            const idx = mol.addAtom(OCL.Molecule.getAtomicNoFromLabel(elem));
            mol.setAtomX(idx, atom.position.x);
            mol.setAtomY(idx, atom.position.y);
            mol.setAtomZ(idx, atom.position.z);
            atomIndexMap.set(atom, idx);
        });

        // Pre-process bonds to identify types
        const bondList = [];
        const aromaticBonds = []; // List of {atom1, atom2, bondObj}
        const atomAromaticBonds = new Map(); // atom -> [bondEntry]

        const processedBonds = new Set();

        atoms.forEach(atom => {
            if (!atom.bonds) return;
            atom.bonds.forEach(bond => {
                if (!processedBonds.has(bond)) {
                    const idx1 = atomIndexMap.get(bond.atom1);
                    const idx2 = atomIndexMap.get(bond.atom2);

                    if (idx1 !== undefined && idx2 !== undefined) {
                        let order = 1;
                        let isAromaticCandidate = false;

                        const originalOrder = bond.order || 1;
                        if (originalOrder > 1) {
                            order = originalOrder; // Trust explicit high order
                        } else {
                            // Geometry inference
                            const dist = bond.atom1.position.distanceTo(bond.atom2.position);
                            const el1 = bond.atom1.element;
                            const el2 = bond.atom2.element;

                            if ((el1 === 'C' && el2 === 'C')) {
                                if (dist < 1.25) order = 3;
                                else if (dist < 1.38) order = 2;
                                else if (dist < 1.45) isAromaticCandidate = true;
                            } else if ((el1 === 'C' && el2 === 'N') || (el1 === 'N' && el2 === 'C')) {
                                if (dist < 1.22) order = 3;
                                else if (dist < 1.35) order = 2;
                                // C-N aromatic? Pyridine C-N is ~1.34 (Double-like) or 1.37.
                                // Let's treat < 1.38 as Double/Aromatic candidate?
                                // For now, stick to explicit thresholds.
                            } else if ((el1 === 'C' && el2 === 'O') || (el1 === 'O' && el2 === 'C')) {
                                if (dist < 1.30) order = 2;
                            } else if ((el1 === 'N' && el2 === 'N')) {
                                if (dist < 1.15) order = 3;
                                else if (dist < 1.30) order = 2;
                            }
                        }

                        if (isAromaticCandidate) {
                            const bondEntry = { idx1, idx2, assignedOrder: 0 }; // 0 means pending
                            aromaticBonds.push(bondEntry);

                            if (!atomAromaticBonds.has(idx1)) atomAromaticBonds.set(idx1, []);
                            if (!atomAromaticBonds.has(idx2)) atomAromaticBonds.set(idx2, []);
                            atomAromaticBonds.get(idx1).push(bondEntry);
                            atomAromaticBonds.get(idx2).push(bondEntry);
                        } else {
                            bondList.push({ idx1, idx2, order });
                        }
                        processedBonds.add(bond);
                    }
                }
            });
        });

        // Greedy Kekulization for Aromatic Candidates
        // Assign alternating Double (2) and Single (1)

        for (let i = 0; i < atoms.length; i++) {
            const idx = i; // OCL index matches loop since we added in order
            if (atomAromaticBonds.has(idx)) {
                // Check if atom already has a Double bond assigned in aromatic set
                const bonds = atomAromaticBonds.get(idx);
                let hasDouble = bonds.some(b => b.assignedOrder === 2);

                // Assign remaining undefined bonds
                bonds.forEach(bond => {
                    if (bond.assignedOrder === 0) {
                        if (!hasDouble) {
                            bond.assignedOrder = 2;
                            hasDouble = true;
                        } else {
                            bond.assignedOrder = 1;
                        }
                    }
                });
            }
        }

        // Add standard bonds
        bondList.forEach(b => {
            const bondIdx = mol.addBond(b.idx1, b.idx2);
            mol.setBondOrder(bondIdx, b.order);
        });

        // Add kekulized aromatic bonds
        aromaticBonds.forEach(b => {
            const order = b.assignedOrder || 1; // Default to 1 if missed
            const bondIdx = mol.addBond(b.idx1, b.idx2);
            mol.setBondOrder(bondIdx, order);
        });

        // FALLBACK AUTO-BOND for OCL
        if (mol.getAllBonds() === 0 && atoms.length > 1) {
            console.log('[FileIO] No bonds found, applying fallback auto-bond for OCL');
            for (let i = 0; i < atoms.length; i++) {
                for (let j = i + 1; j < atoms.length; j++) {
                    const dist = atoms[i].position.distanceTo(atoms[j].position);
                    if (dist < 1.9) {
                        const bIdx = mol.addBond(i, j);
                        mol.setBondOrder(bIdx, 1);
                    }
                }
            }
        }

        // Use OCL to ensure validity and perceive properties
        mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);

        return mol;
    }

    /**
     * Export molecule as SVG using OCL
     * @param {Object} options
     * @param {boolean} [options.splitFragments=false]
     * @param {boolean} [options.showLabels=false]
     * @param {boolean} [options.showHydrogens=false]
     * @returns {string|string[]} SVG string or array of strings
     */
    exportSVG(options = {}) {
        const { splitFragments = false, showLabels = false, showHydrogens = false } = options;
        const fragments = splitFragments ? this.getFragments() : [this.editor.molecule.atoms];

        const svgs = [];

        fragments.forEach(frag => {
            try {
                const mol = this.atomsToOCL(frag);

                // 1. Hydrogen Persistence Logic
                // OCL's inventCoordinates() aggressively strips standard Hydrogens (AtomicNo 1).
                // To prevent this, we set the atom mass to 1 (Protium).
                // This marks the Hydrogen as "explicit isotope" which OCL preserves,
                // but it still renders as "H" (not "1H") and draws the bond correctly.
                // This is the clean, direct method requested by the user.

                if (showHydrogens) {
                    // A. Convert EXISTING Hydrogens to Explicit Mass 1
                    const currentAtomCount = mol.getAllAtoms();
                    for (let i = 0; i < currentAtomCount; i++) {
                        if (mol.getAtomicNo(i) === 1) {
                            mol.setAtomMass(i, 1); // Explicit Mass 1
                        }
                    }

                    // B. Add IMPLICIT Hydrogens as Explicit Mass 1
                    const originalCount = currentAtomCount;
                    for (let i = 0; i < originalCount; i++) {
                        // Only check implicit H for non-H atoms
                        const atomicNo = mol.getAtomicNo(i);
                        if (atomicNo !== 1) {
                            const implicitH = mol.getImplicitHydrogens(i);
                            for (let h = 0; h < implicitH; h++) {
                                const hIdx = mol.addAtom(1); // Add Hydrogen
                                mol.addBond(i, hIdx, 1); // Single bond
                                mol.setAtomMass(hIdx, 1); // Explicit Mass 1
                            }
                        }
                    }
                }

                // 2. Prepare Labels and Map Numbers
                // We use setAtomMapNo to get exact SVG coordinates via data attributes.
                // This is non-intrusive and doesn't break OCL's layout algorithms.

                const atomCount = mol.getAllAtoms();
                const selectedAtomIndices = [];

                for (let i = 0; i < atomCount; i++) {
                    // Track selected atoms
                    let isOriginal = i < frag.length;
                    let atom = isOriginal ? frag[i] : null;
                    if (isOriginal && atom && atom.selected) {
                        selectedAtomIndices.push(i);
                    }

                    // Set Map No to index + 1 (to avoid 0 being ignored)
                    mol.setAtomMapNo(i, i + 1, false);

                    // Handle Labels
                    const atomicNo = mol.getAtomicNo(i);

                    if (showLabels) {
                        // Labels ON:
                        // OCL will show Element symbol by default.
                        // We will add Index separately in post-processing.
                        // For Hydrogen, we want "H" (or "H:idx" style, but we'll do that manually)

                        // Ensure Hydrogens are labeled "H." (dot trick) to prevent stripping
                        // We will remove the dot in post-processing
                        if (atomicNo === 1) {
                            mol.setAtomCustomLabel(i, "H.");
                        }
                    } else {
                        // Labels OFF:
                        // Hide Carbon (default), Show Hydrogen as "H."
                        if (atomicNo === 1) {
                            mol.setAtomCustomLabel(i, "H.");
                        }
                    }
                }

                // 3. Generate clean 2D coordinates
                mol.inventCoordinates();

                // 4. Scale Coordinates (User Request)
                // mol.scaleCoords(1.0); // Keep default scaling

                // 5. Generate SVG
                let svg = mol.toSVG(1200, 900);

                // 6. Parse Coordinates from Map Numbers
                // OCL renders: <circle ... data-atom-map-no="123" cx="..." cy="..." ... />
                const atomCoords = {};
                const mapNoRegex = /<circle[^>]*data-atom-map-no="(\d+)"[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"/g;
                let match;
                while ((match = mapNoRegex.exec(svg)) !== null) {
                    const idx = parseInt(match[1]) - 1; // Subtract 1 to get back 0-based index
                    const x = parseFloat(match[2]);
                    const y = parseFloat(match[3]);
                    atomCoords[idx] = { x, y };
                }

                // 7. Inject Highlights (Yellow Atoms AND Bonds)
                // We use a group with opacity to prevent overlapping artifacts
                const highlightElements = [];

                if (selectedAtomIndices.length > 0) {
                    // A. Highlight Bonds
                    // Check all bonds in the OCL molecule
                    const bondCount = mol.getAllBonds();
                    for (let b = 0; b < bondCount; b++) {
                        const atom1 = mol.getBondAtom(0, b);
                        const atom2 = mol.getBondAtom(1, b);

                        // If both atoms are selected, highlight the bond
                        // Note: selectedAtomIndices contains OCL atom indices (since we mapped 1:1)
                        if (selectedAtomIndices.includes(atom1) && selectedAtomIndices.includes(atom2)) {
                            const coords1 = atomCoords[atom1];
                            const coords2 = atomCoords[atom2];

                            if (coords1 && coords2) {
                                highlightElements.push(
                                    `<line x1="${coords1.x}" y1="${coords1.y}" x2="${coords2.x}" y2="${coords2.y}" stroke="#FFFF00" stroke-width="12" stroke-linecap="round" />`
                                );
                            }
                        }
                    }

                    // B. Highlight Atoms
                    selectedAtomIndices.forEach(atomIdx => {
                        const coords = atomCoords[atomIdx];
                        if (coords) {
                            highlightElements.push(`<circle cx="${coords.x}" cy="${coords.y}" r="9" fill="#FFFF00" />`);
                        }
                    });
                }

                // Inject highlight group at the beginning
                if (highlightElements.length > 0) {
                    const group = `<g opacity="0.4">${highlightElements.join('')}</g>`;
                    const insertPos = svg.indexOf('>') + 1;
                    svg = svg.slice(0, insertPos) + group + svg.slice(insertPos);
                }

                // 8. Inject Index Labels (Red)
                if (showLabels) {
                    const indexLabels = [];
                    for (let i = 0; i < atomCount; i++) {
                        // Only label original atoms
                        if (i < frag.length) {
                            const coords = atomCoords[i];
                            if (coords) {
                                const atom = frag[i];
                                const originalIdx = this.editor.molecule.atoms.indexOf(atom);

                                // Position
                                const labelX = coords.x + 4;
                                const labelY = coords.y - 4;

                                indexLabels.push(
                                    `<text x="${labelX}" y="${labelY}" font-size="7" fill="red" font-weight="bold">${originalIdx}</text>`
                                );
                            }
                        }
                    }

                    if (indexLabels.length > 0) {
                        const insertPos = svg.lastIndexOf('</svg>');
                        svg = svg.slice(0, insertPos) + indexLabels.join('') + svg.slice(insertPos);
                    }
                }

                // 9. Crop Logic (Calculate Bounding Box)
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

                const updateBounds = (x, y) => {
                    if (!isNaN(x) && !isNaN(y)) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                };

                // Parse lines
                const lineRegex = /<line[^>]*x1="([-\d.]+)"[^>]*y1="([-\d.]+)"[^>]*x2="([-\d.]+)"[^>]*y2="([-\d.]+)"/g;
                while ((match = lineRegex.exec(svg)) !== null) {
                    updateBounds(parseFloat(match[1]), parseFloat(match[2]));
                    updateBounds(parseFloat(match[3]), parseFloat(match[4]));
                }

                // Parse text
                const textRegex = /<text[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"[^>]*>([^<]*)<\/text>/g;
                while ((match = textRegex.exec(svg)) !== null) {
                    const x = parseFloat(match[1]);
                    const y = parseFloat(match[2]);
                    // Approximate text dimensions
                    const fontSize = 10;
                    const textLen = match[3].length * (fontSize * 0.6);

                    updateBounds(x - textLen / 2, y - fontSize);
                    updateBounds(x + textLen / 2, y + fontSize / 2);
                }

                // Parse circles (highlights)
                // We know highlights are at atomCoords with r=15
                // We check highlightElements instead of highlightCircles
                if (highlightElements.length > 0) {
                    Object.values(atomCoords).forEach(coords => {
                        updateBounds(coords.x - 15, coords.y - 15);
                        updateBounds(coords.x + 15, coords.y + 15);
                    });
                }

                if (minX < Infinity && maxX > -Infinity) {
                    // Add padding
                    const padding = 20;
                    minX -= padding;
                    minY -= padding;
                    maxX += padding;
                    maxY += padding;
                    const w = maxX - minX;
                    const h = maxY - minY;

                    svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${minX} ${minY} ${w} ${h}"`);
                }

                // 10. Post-process Styles
                // Reduce font size and stroke width
                svg = svg.replace(/font-size="14"/g, 'font-size="10"');
                svg = svg.replace(/stroke-width="1.44"/g, 'stroke-width="1.2"');

                // Clean up H. labels: Remove dot AND shift right to center
                // "H." is centered by OCL. "H" is narrower.
                // Removing "." makes "H" look shifted left relative to bond.
                // We need to shift it RIGHT to re-center.
                svg = svg.replace(/<text([^>]*x=")([-\d.]+)([^>]*>H)\.<\/text>/g, (match, prefix, xVal, suffix) => {
                    const newX = parseFloat(xVal) + 3; // Shift 3 pixels right
                    return `<text${prefix}${newX}${suffix}</text>`;
                });

                // Remove mass number "1" superscripts from Hydrogens (if any remain)
                // Pattern: <text ... font-size="9" ...>1</text>
                svg = svg.replace(/<text[^>]*font-size="9"[^>]*>1<\/text>/g, '');

                // Clean up any remaining artifacts
                svg = svg.replace(/<!--REMOVED_MASS-->/g, '');

                svgs.push(svg);
            } catch (e) {
                console.error('SVG generation failed for fragment:', e);
            }
        });

        if (splitFragments) {
            return svgs;
        } else {
            return svgs.length > 0 ? svgs[0] : '';
        }
    }

    /**
     * Export molecule as PNG Data URL (Async)
     * @param {Object} options
     * @returns {Promise<string|string[]>} PNG Data URL or array of them
     */
    async exportPNG(options = {}) {
        const svgs = this.exportSVG({ ...options, splitFragments: true }); // Always get array to simplify
        const pngs = [];

        for (const svg of svgs) {
            if (!svg) continue;
            try {
                const png = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        // Parse width/height from SVG or use default
                        const wMatch = svg.match(/width="(\d+)(px)?"/);
                        const hMatch = svg.match(/height="(\d+)(px)?"/);
                        canvas.width = wMatch ? parseInt(wMatch[1]) : 1200;
                        canvas.height = hMatch ? parseInt(hMatch[1]) : 900;

                        const ctx = canvas.getContext('2d');
                        // White background
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    };
                    img.onerror = (e) => reject(new Error('Image load failed'));
                    // Handle Unicode in SVG for Data URL
                    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
                });
                pngs.push(png);
            } catch (e) {
                console.error('PNG conversion failed:', e);
                pngs.push(null);
            }
        }

        if (options.splitFragments) {
            return pngs;
        } else {
            return pngs.length > 0 ? pngs[0] : null;
        }
    }



    /**
     * Convert atoms to JSON format
     * @param {Object[]} atoms - Array of atom objects
     * @returns {string} JSON string
     */
    atomsToJSON(atoms) {
        const data = atoms.map(atom => ({
            element: atom.element,
            position: {
                x: atom.position.x,
                y: atom.position.y,
                z: atom.position.z
            },
            index: atoms.indexOf(atom)
        }));

        return JSON.stringify(data, null, 2);
    }

    /**
     * Download XYZ file
     */
    downloadXYZ() {
        const xyz = this.exportXYZ();

        if (!xyz) {
            return ErrorHandler.error('No atoms to export');
        }

        const blob = new Blob([xyz], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `molecule_${Date.now()}.xyz`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);

        return ErrorHandler.success('XYZ file downloaded');
    }

    /**
     * Load XYZ from file input
     * @param {File} file - File object
     * @returns {Promise<Object>} Result object
     */
    async loadXYZFile(file) {
        try {
            const text = await file.text();
            return this.importXYZ(text);
        } catch (error) {
            ErrorHandler.logError('FileIOManager.loadXYZFile', error);
            return ErrorHandler.error('Failed to read file', error.message);
        }
    }
    /**
     * Import XYZ string
     * @param {string} xyz 
     * @param {Object} options 
     */
    importXYZ(xyz, options = {}) {
        const { shouldClear = true, autoBond = false } = options;
        if (!xyz) return ErrorHandler.error('Empty XYZ data');

        const lines = xyz.trim().split('\n');
        let currentIndex = 0;
        let moleculeCount = 0;

        if (shouldClear) {
            this.resetMolecules();
        }

        while (currentIndex < lines.length) {
            const countLine = lines[currentIndex].trim();
            if (!countLine) {
                currentIndex++;
                continue;
            }

            const atomCount = parseInt(countLine);
            if (isNaN(atomCount)) {
                console.warn(`Invalid XYZ atom count at line ${currentIndex}: ${countLine}`);
                break;
            }

            // Extract block
            const endIndex = Math.min(currentIndex + 2 + atomCount, lines.length);
            console.log(`[ImportXYZ] Frame ${moleculeCount}: Atoms=${atomCount} Start=${currentIndex} End=${endIndex} TotalLines=${lines.length}`);

            const blockLines = lines.slice(currentIndex, endIndex);
            const block = blockLines.join('\n');

            const name = (currentIndex + 1 < lines.length) ? lines[currentIndex + 1].trim() : `Molecule ${moleculeCount + 1}`;

            if (moleculeCount > 0 || !shouldClear) {
                console.log(`[ImportXYZ] Creating new molecule: ${name}`);
                this.editor.moleculeManager.createMolecule(name);
            } else {
                console.log(`[ImportXYZ] Renaming first molecule: ${name}`);
                this.editor.moleculeManager.renameMolecule(0, name);
            }

            this.importSingleXYZ(block, { shouldClear: true, autoBond });

            currentIndex = endIndex;
            moleculeCount++;
        }
        console.log(`[ImportXYZ] Total imported: ${moleculeCount}`);

        this.editor.moleculeManager.updateUI();
        return ErrorHandler.success(`Imported ${moleculeCount} molecules from XYZ`);
    }

    importSingleXYZ(xyz, options = {}) {
        const { shouldClear = true, autoBond = false } = options;

        if (!xyz) return ErrorHandler.error('Empty XYZ data');

        const lines = xyz.trim().split('\n');
        if (lines.length < 3) return ErrorHandler.error('Invalid XYZ format (too few lines)');

        // Parse atom count
        const atomCount = parseInt(lines[0].trim());
        if (isNaN(atomCount)) return ErrorHandler.error('Invalid XYZ format (atom count missing)');

        // If shouldClear is true, clear existing
        if (shouldClear) {
            this.editor.molecule.clear();
        }

        const startLine = 2; // Skip count and comment
        let importedCount = 0;

        for (let i = 0; i < atomCount; i++) {
            if (startLine + i >= lines.length) break;

            const line = lines[startLine + i].trim();
            if (!line) continue;

            const parts = line.split(/\s+/);
            if (parts.length < 4) continue;

            const element = parts[0];
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                this.editor.addAtomToScene(element, new THREE.Vector3(x, y, z));
                importedCount++;
            }
        }

        if (autoBond) {
            this.editor.autoBond();
        }

        this.editor.rebuildScene();
        return ErrorHandler.success(`Imported ${importedCount} atoms from XYZ`);
    }
}
