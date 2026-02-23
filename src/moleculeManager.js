import { Molecule } from './molecule.js';
import { GeometryEngine } from './geometryEngine.js';
import * as THREE from 'three';
import { ELEMENTS, DEFAULT_ELEMENT } from './constants.js';
import OCL from 'openchemlib';
import { oclManager } from './managers/oclManager.js';

export class MoleculeManager {
    constructor(editor) {
        this.editor = editor;
        this.molecules = []; // Array of { id, name, molecule: Molecule, history, historyIndex, settings }
        this.activeMoleculeIndex = -1;
        this.nextId = 1;

        // Clipboard for copy/paste operations
        this.clipboard = {
            atoms: [],      // Atom data: { element, position }
            bonds: [],      // Bond data: { atom1Idx, atom2Idx, order }
            centerOfMass: null
        };

        // Initialize with one empty molecule
        this.createMolecule("Molecule 1");
    }

    createMolecule(name) {
        // Generate name if not provided
        if (!name) {
            name = `Molecule ${this.molecules.length + 1}`;
            // Ensure unique name
            let counter = 1;
            while (this.molecules.some(m => m.name === name)) {
                counter++;
                name = `Molecule ${this.molecules.length + counter}`;
            }
        } else {
            // Auto-generate unique name if duplicate exists
            if (this.molecules.some(m => m.name === name)) {
                let counter = 1;
                let uniqueName = `${name}_${counter}`;
                while (this.molecules.some(m => m.name === uniqueName)) {
                    counter++;
                    uniqueName = `${name}_${counter}`;
                }
                name = uniqueName;
            }
        }

        const molecule = new Molecule(name);
        const entry = {
            id: this.nextId++,
            name: name,
            molecule: molecule,
            history: [],
            historyIndex: -1,
            settings: {
                labelMode: 'none',
                colorScheme: 'jmol'
            }
        };

        this.molecules.push(entry);

        // Always switch to the newly created molecule
        const newIndex = this.molecules.length - 1;
        this.switchMolecule(newIndex);

        return entry;
    }

    removeMolecule(index) {
        if (index < 0 || index >= this.molecules.length) {
            return { error: `Invalid molecule index: ${index}` };
        }

        if (this.molecules.length === 1) {
            return { error: "Cannot remove the last molecule" };
        }

        const removed = this.molecules.splice(index, 1)[0];

        // Adjust active index
        if (index === this.activeMoleculeIndex) {
            // If removed active molecule, prevent saving state for it
            this.activeMoleculeIndex = -1;

            // Switch to the previous one (or 0)
            const newIndex = Math.max(0, index - 1);
            this.switchMolecule(newIndex);
        } else if (index < this.activeMoleculeIndex) {
            // If removed molecule was before active one, decrement index
            this.activeMoleculeIndex--;
        }

        this.updateUI();
        return { success: `Removed molecule "${removed.name}"` };
    }

    switchMolecule(index) {
        if (index < 0 || index >= this.molecules.length) {
            return { error: `Invalid molecule index: ${index}` };
        }

        // Save current molecule's state (history and settings)
        if (this.activeMoleculeIndex !== -1) {
            this.saveHistoryToActive();
            this.saveSettingsToActive();
        }

        // Clear selection to prevent ghost selection in new molecule
        if (this.editor.molecule) {
            this.editor.selectionManager.clearSelection();
        }

        // Switch to new molecule
        this.activeMoleculeIndex = index;
        const entry = this.molecules[index];

        // Update Editor's molecule reference - Now handled by getter in Editor
        // this.editor.molecule = entry.molecule;

        // Load new molecule's state (history and settings)
        this.loadHistoryFromActive();
        this.loadSettingsFromActive();

        // Rebuild scene for the new molecule
        this.editor.rebuildScene();

        // Update UI
        this.updateUI();

        return { success: `Switched to "${entry.name}"` };
    }

    renameMolecule(index, newName) {
        if (index < 0 || index >= this.molecules.length) {
            return { error: `Invalid molecule index: ${index}` };
        }

        if (!newName) {
            return { error: "Name cannot be empty" };
        }

        const entry = this.molecules[index];
        const oldName = entry.name;
        entry.name = newName;
        entry.molecule.name = newName; // Sync name to Molecule instance

        this.updateUI();
        return { success: `Renamed "${oldName}" to "${newName}"` };
    }

    saveHistoryToActive() {
        if (this.activeMoleculeIndex === -1) return;

        const entry = this.molecules[this.activeMoleculeIndex];
        entry.history = [...this.editor.history];
        entry.historyIndex = this.editor.historyIndex;
    }

    loadHistoryFromActive() {
        if (this.activeMoleculeIndex === -1) return;

        const entry = this.molecules[this.activeMoleculeIndex];
        this.editor.history = [...entry.history];
        this.editor.historyIndex = entry.historyIndex;
    }

    saveSettingsToActive() {
        if (this.activeMoleculeIndex === -1) return;

        const entry = this.molecules[this.activeMoleculeIndex];
        entry.settings.labelMode = this.editor.labelMode;
        entry.settings.colorScheme = this.editor.colorScheme;
    }

    loadSettingsFromActive() {
        if (this.activeMoleculeIndex === -1) return;

        const entry = this.molecules[this.activeMoleculeIndex];
        this.editor.labelMode = entry.settings.labelMode;
        this.editor.colorScheme = entry.settings.colorScheme;

        // Apply settings
        this.editor.updateAllLabels();
    }

    copySelection() {
        const activeMol = this.getActive();
        if (!activeMol) return { error: 'No active molecule' };

        const selectedAtoms = activeMol.molecule.atoms.filter(a => a.selected);
        if (selectedAtoms.length === 0) {
            return { error: 'No atoms selected' };
        }

        // Store atom data
        this.clipboard.atoms = selectedAtoms.map(atom => ({
            element: atom.element,
            position: atom.position.clone()
        }));

        // Calculate center of mass
        this.clipboard.centerOfMass = GeometryEngine.getCenterOfMass(selectedAtoms);

        // Store bond data (only bonds between selected atoms)
        this.clipboard.bonds = [];
        activeMol.molecule.bonds.forEach(bond => {
            const idx1 = selectedAtoms.indexOf(bond.atom1);
            const idx2 = selectedAtoms.indexOf(bond.atom2);

            if (idx1 !== -1 && idx2 !== -1) {
                this.clipboard.bonds.push({
                    atom1Idx: idx1,
                    atom2Idx: idx2,
                    order: bond.order
                });
            }
        });

        return { success: `Copied ${selectedAtoms.length} atom(s) to clipboard` };
    }

    pasteClipboard(minDistance = 0) {
        if (this.clipboard.atoms.length === 0) {
            return { error: 'Clipboard is empty' };
        }

        const activeMol = this.getActive();
        if (!activeMol) return { error: 'No active molecule' };

        // Deselect current selection
        activeMol.molecule.atoms.forEach(a => a.selected = false);
        this.editor.selectionOrder = [];

        // Calculate offset (e.g., shift by 2.0 units to avoid overlap)
        const offset = new THREE.Vector3(2, 2, 0);

        const newAtoms = [];
        const indexMap = []; // Map clipboard index to new atom

        // Create atoms
        this.clipboard.atoms.forEach((data, i) => {
            const newPos = data.position.clone().add(offset);
            const atom = activeMol.molecule.addAtom(data.element, newPos);
            atom.selected = true;
            newAtoms.push(atom);
            indexMap[i] = atom;
            this.editor.selectionOrder.push(atom);
        });

        // Create bonds
        this.clipboard.bonds.forEach(bondData => {
            const atom1 = indexMap[bondData.atom1Idx];
            const atom2 = indexMap[bondData.atom2Idx];
            if (atom1 && atom2) {
                activeMol.molecule.addBond(atom1, atom2, bondData.order);
            }
        });

        this.editor.rebuildScene();
        this.editor.updateSelectionInfo();
        this.editor.saveState(); // Save after paste

        return { success: `Pasted ${newAtoms.length} atom(s)` };
    }

    mergeMolecule(sourceIndex, minDistance = 0) {
        if (sourceIndex < 0 || sourceIndex >= this.molecules.length) {
            return { error: `Invalid molecule index: ${sourceIndex}` };
        }

        if (sourceIndex === this.activeMoleculeIndex) {
            return { error: 'Cannot merge molecule with itself' };
        }

        const sourceMol = this.molecules[sourceIndex];
        const targetMol = this.getActive();

        if (!targetMol) return { error: 'No active molecule' };

        // Remove source molecule
        const sourceAtomCount = sourceMol.molecule.atoms.length;
        this.removeMolecule(sourceIndex);

        this.editor.saveState(); // Save after merge

        return { success: `Merged ${sourceAtomCount} atoms from "${sourceMol.name}" into "${targetMol.name}"` };
    }

    substituteGroup(args) {
        // Parse arguments: <TargetSpec> -n <SourceMolName> <SourceSpec>
        // TargetSpec: 1 or 2 indices
        // SourceSpec: 1 or 2 indices

        const targetIndices = [];
        let sourceMolName = null;
        let sourceMolIndex = -1;
        const sourceIndices = [];

        let parsingTarget = true;
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '-n' || arg === '--name') {
                if (i + 1 >= args.length) return { error: 'Missing molecule name after -n' };
                sourceMolName = args[i + 1];
                parsingTarget = false;
                i++;
            } else if (arg === '-i' || arg === '--index') {
                if (i + 1 >= args.length) return { error: 'Missing molecule index after -i' };
                sourceMolIndex = parseInt(args[i + 1]); // 0-based
                parsingTarget = false;
                i++;
            } else {
                const val = parseInt(arg);
                if (isNaN(val)) return { error: `Invalid index: ${arg}` };
                if (parsingTarget) targetIndices.push(val); // 0-based
                else sourceIndices.push(val); // 0-based
            }
        }

        // Validate Source Molecule
        let sourceMolEntry = null;
        if (sourceMolName) {
            sourceMolEntry = this.molecules.find(m => m.name === sourceMolName);
        } else if (sourceMolIndex >= 0) {
            if (sourceMolIndex >= this.molecules.length) return { error: `Invalid source index: ${sourceMolIndex + 1}` };
            sourceMolEntry = this.molecules[sourceMolIndex];
        }

        if (!sourceMolEntry) return { error: 'Source molecule not found' };
        if (sourceMolEntry === this.getActive()) return { error: 'Cannot substitute with self' };

        // Resolve Target Atoms (Leaving, Anchor)
        const targetRes = this.resolveSubstitutionIndices(this.getActive().molecule, targetIndices);
        if (targetRes.error) return targetRes;
        const { leaving: targetLeaving, anchor: targetAnchor } = targetRes;

        // Resolve Source Atoms (Leaving, Anchor)
        const sourceRes = this.resolveSubstitutionIndices(sourceMolEntry.molecule, sourceIndices);
        if (sourceRes.error) return sourceRes;
        const { leaving: sourceLeaving, anchor: sourceAnchor } = sourceRes;

        // Remove Source Molecule
        const sourceIndex = this.molecules.indexOf(sourceMolEntry);
        if (sourceIndex >= 0) {
            this.removeMolecule(sourceIndex);
        }

        this.editor.saveState(); // Save after substitution

        return { success: `Substituted group from ${sourceMolEntry.name}` };
    }

    resolveSubstitutionIndices(molecule, indices) {
        if (indices.length === 2) {
            // Explicit: Leaving, Anchor
            const leaving = molecule.atoms[indices[0]];
            const anchor = molecule.atoms[indices[1]];
            if (!leaving || !anchor) return { error: 'Invalid indices' };

            // Verify bond
            if (!molecule.getBond(leaving, anchor)) return { error: `Atoms ${indices[0] + 1} and ${indices[1] + 1} are not bonded` };

            return { leaving, anchor };
        } else if (indices.length === 1) {
            // Implicit: Anchor (Find Dummy)
            const anchor = molecule.atoms[indices[0]];
            if (!anchor) return { error: 'Invalid anchor index' };

            // Find 'X' neighbor with 1 bond
            const neighbors = anchor.bonds.map(b => b.atom1 === anchor ? b.atom2 : b.atom1);
            const dummies = neighbors.filter(a => a.element === 'X' && a.bonds.length === 1);

            if (dummies.length === 0) return { error: `No terminal 'X' atom found attached to atom ${indices[0] + 1}` };
            if (dummies.length > 1) return { error: `Ambiguous: Multiple 'X' atoms attached to atom ${indices[0] + 1}` };

            return { leaving: dummies[0], anchor };
        } else {
            return { error: 'Invalid number of indices (must be 1 or 2)' };
        }
    }

    getActive() {
        if (this.activeMoleculeIndex < 0 || this.activeMoleculeIndex >= this.molecules.length) {
            return null;
        }
        return this.molecules[this.activeMoleculeIndex];
    }

    getActiveIndex() {
        return this.activeMoleculeIndex;
    }

    updateUI() {
        const container = document.getElementById('molecule-list');
        if (!container) return;

        container.innerHTML = '';

        this.molecules.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = `molecule-item ${index === this.activeMoleculeIndex ? 'active' : ''}`;
            item.innerHTML = `
                <span class="molecule-name">${entry.name}</span>
                <span class="molecule-info">${entry.molecule.atoms.length} atoms</span>
            `;

            item.onclick = () => {
                this.switchMolecule(index);
            };

            container.appendChild(item);
        });
    }

    /**
     * Auto-generate bonds based on distance
     * @param {number} thresholdFactor - Factor to multiply covalent radii sum
     * @returns {number} Number of bonds added
     */
    autoBond(thresholdFactor = 1.1) {
        const activeMol = this.getActive();
        if (!activeMol) return 0;

        const atoms = activeMol.molecule.atoms;
        let bondsAdded = 0;

        for (let i = 0; i < atoms.length; i++) {
            for (let j = i + 1; j < atoms.length; j++) {
                const dist = atoms[i].position.distanceTo(atoms[j].position);

                // Get covalent radii
                const r1 = this.getElementRadius(atoms[i].element);
                const r2 = this.getElementRadius(atoms[j].element);
                const bondThreshold = (r1 + r2) * thresholdFactor;

                if (dist < bondThreshold) {
                    // Check if bond already exists
                    if (!activeMol.molecule.getBond(atoms[i], atoms[j])) {
                        activeMol.molecule.addBond(atoms[i], atoms[j], 1);
                        bondsAdded++;
                    }
                }
            }
        }

        return bondsAdded;
    }

    /**
     * Remove specific atoms from the active molecule
     * @param {Object[]} atomsToRemove - Array of atom objects to remove
     * @returns {number} Number of atoms removed
     */
    removeAtoms(atomsToRemove) {
        const activeMol = this.getActive();
        if (!activeMol || !atomsToRemove || atomsToRemove.length === 0) return 0;

        let count = 0;
        atomsToRemove.forEach(atom => {
            if (activeMol.molecule.removeAtom(atom)) {
                count++;
            }
        });

        return count;
    }

    /**
     * Get element radius
     * @param {string} element - Element symbol
     * @returns {number} Radius
     */
    getElementRadius(element) {
        const data = ELEMENTS[element] || DEFAULT_ELEMENT;
        return data.radius;
    }

    async addExplicitHydrogens() {
        try {
            const molBlock = this.editor.fileIOManager.exportSDF();
            await oclManager.init();
            const mol = OCL.Molecule.fromMolfile(molBlock);

            // Generate 3D with hydrogens
            const newMol = await oclManager.generate3D(mol);
            const newMolBlock = newMol.toMolfile();

            this.editor.fileIOManager.importSDF(newMolBlock, { shouldClear: true, autoBond: false });
            return { success: 'Added explicit hydrogens' };
        } catch (e) {
            console.error('addExplicitHydrogens failed:', e);
            return { error: e.message };
        }
    }

    async optimizeGeometry() {
        try {
            const molBlock = this.editor.fileIOManager.exportSDF();
            await oclManager.init();
            const mol = OCL.Molecule.fromMolfile(molBlock);

            // Generate 3D (Optimization)
            // Note: OCL's generate3D effectively optimizes geometry from scratch based on connectivity
            const newMol = await oclManager.generate3D(mol);
            const newMolBlock = newMol.toMolfile();

            this.editor.fileIOManager.importSDF(newMolBlock, { shouldClear: true, autoBond: false });
            return { success: 'Geometry optimized' };
        } catch (e) {
            console.error('optimizeGeometry failed:', e);
            return { error: e.message };
        }
    }
}
