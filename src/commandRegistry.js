import * as THREE from 'three';
import { ELEMENTS } from './constants.js';
import { GeometryEngine } from './geometryEngine.js';
import { rdkitManager } from './managers/rdkitManager.js';

export class CommandRegistry {
    constructor(editor) {
        this.editor = editor;
        this.commands = new Map();
        this.registerDefaultCommands();
    }

    register(name, aliases, help, arg4, arg5) {
        let execute, options;
        if (typeof arg4 === 'function') {
            execute = arg4;
            options = arg5 || {};
        } else {
            options = arg4 || {};
            execute = arg5;
        }

        const command = { name, aliases, help, execute, ...options };
        this.commands.set(name, command);

        // Register aliases
        aliases.forEach(alias => {
            this.commands.set(alias, command);
        });
    }

    get(name) {
        return this.commands.get(name.toLowerCase());
    }

    getAllCommands() {
        const seen = new Set();
        const commands = [];

        this.commands.forEach((cmd) => {
            if (!seen.has(cmd.name)) {
                seen.add(cmd.name);
                commands.push(cmd);
            }
        });

        return commands;
    }

    registerDefaultCommands() {
        this.register('read', [], 'read <filename> - Read a local file', async (args) => {
            if (!this.editor.isLocalMode) {
                return { error: 'Command only available in local mode' };
            }
            if (args.length < 1) {
                return { error: 'Usage: read <filename>' };
            }
            const filename = args[0];
            await this.editor.fileIOManager.loadLocalFile(filename);
            return { success: `Reading ${filename}...` };
        });

        this.register('run', [], 'run <filename> - Execute commands from a local file', async (args) => {
            if (!this.editor.isLocalMode) {
                return { error: 'Command only available in local mode' };
            }
            if (args.length < 1) {
                return { error: 'Usage: run <filename>' };
            }
            const filename = args[0];
            await this.editor.fileIOManager.loadLocalFile(filename);
            return { success: `Running ${filename}...` };
        });

        // Help command
        this.register('help', ['h'], 'help [command] - Show commands', (args) => {
            if (args.length === 0) {
                const commands = this.getAllCommands();
                let output = 'Available commands:\n';
                commands.forEach(cmd => {
                    const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
                    output += `  ${cmd.name}${aliases}: ${cmd.help}\n`;
                });
                return { info: output };
            }

            const cmd = this.get(args[0]);
            if (!cmd) {
                return { error: `Command '${args[0]}' not found` };
            }
            return { info: cmd.help };
        });

        // List command (Consolidated)
        this.register('list', ['ls', 'l'], 'list <mols|atoms|frags> [options] - List objects', (args) => {
            if (args.length === 0) {
                return { error: 'Usage: list <mols|atoms|frags>' };
            }

            const type = args[0].toLowerCase();

            if (['mols', 'mol', 'molecule', 'molecules'].includes(type)) {
                const molecules = this.editor.moleculeManager.molecules;
                const activeIndex = this.editor.moleculeManager.activeMoleculeIndex;
                let output = `Loaded Molecules (${molecules.length}):\n`;
                molecules.forEach((entry, i) => {
                    const active = i === activeIndex ? '*' : ' ';
                    output += `${active} ${i}: ${entry.name} (${entry.molecule.atoms.length} atoms)\n`;
                });
                return { info: output };
            }
            else if (['fragment', 'frag', 'frags', 'fragments'].includes(type)) {
                const fragments = this.editor.fileIOManager.getFragments();
                if (fragments.length === 0) return { info: 'No fragments' };
                let output = '';
                fragments.forEach((frag, i) => {
                    const indices = frag.map(a => this.editor.molecule.atoms.indexOf(a));
                    output += `Fragment ${i}: atoms [${indices.join(',')}] (${frag.length} atoms)\n`;
                });
                return { info: output };
            }
            else if (['atoms', 'atom'].includes(type)) {
                const selectedOnly = args.includes('-s') || args.includes('--selected');
                const atoms = selectedOnly
                    ? this.editor.molecule.atoms.filter(a => a.selected)
                    : this.editor.molecule.atoms;

                if (atoms.length === 0) return { info: 'No atoms' };

                let output = '';
                atoms.forEach((atom) => {
                    const idx = this.editor.molecule.atoms.indexOf(atom);
                    const pos = atom.position;
                    output += `${idx}: ${atom.element} (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})\n`;
                });
                return { info: output };
            }
            else {
                return { error: `Unknown list type: ${type}. Use 'mols', 'atoms', or 'frags'.` };
            }
        });

        // Add command (Consolidated)
        this.register('add', ['a'], 'add [atom|bond|mol] ...', { isDestructive: true }, (args) => {
            if (args.length === 0) return { error: 'Usage: add [atom|bond|mol] ...' };

            // Check for heredoc data
            const heredocIndex = args.indexOf('__heredoc__');
            if (heredocIndex !== -1) {
                const heredocData = args[heredocIndex + 1];
                // Expect: add mol <format> <<EOF
                if (args[0].toLowerCase() !== 'mol' && args[0].toLowerCase() !== 'molecule') {
                    return { error: 'Heredoc only supported for "add mol <format>"' };
                }
                const format = args[1].toLowerCase();
                try {
                    if (format === 'xyz') {
                        // Use importSingleXYZ to add to current molecule (not importXYZ which creates new molecules)
                        this.editor.fileIOManager.importSingleXYZ(heredocData, { shouldClear: false, autoBond: true });
                        return { success: 'Atoms added from XYZ data' };
                    }
                    return { warning: `${format} format not implemented` };
                } catch (e) {
                    return { error: e.message };
                }
            }

            const subCmd = args[0].toLowerCase();

            // add bond <idx1> <idx2>
            if (subCmd === 'bond') {
                if (args.length !== 3) return { error: 'Usage: add bond <idx1> <idx2>' };
                const idx1 = parseInt(args[1]);
                const idx2 = parseInt(args[2]);
                const atom1 = this.editor.molecule.atoms[idx1];
                const atom2 = this.editor.molecule.atoms[idx2];
                if (!atom1 || !atom2) return { error: 'Invalid atom index' };
                if (this.editor.molecule.getBond(atom1, atom2)) return { warning: 'Bond already exists' };

                this.editor.addBondToScene(atom1, atom2, 1);
                return { success: `Created bond ${idx1}-${idx2}` };
            }

            // add atom <element> [x] [y] [z]
            if (subCmd === 'atom') {
                if (args.length < 2) return { error: 'Usage: add atom <element> [x] [y] [z]' };
                const element = args[1].charAt(0).toUpperCase() + args[1].slice(1).toLowerCase();
                if (!(element in ELEMENTS)) return { error: `Invalid element: ${element}` };

                let x = 0, y = 0, z = 0;
                if (args.length >= 5) {
                    x = parseFloat(args[2]);
                    y = parseFloat(args[3]);
                    z = parseFloat(args[4]);
                }

                if (isNaN(x) || isNaN(y) || isNaN(z)) return { error: 'Coordinates must be numbers' };

                this.editor.addAtomToScene(element, new THREE.Vector3(x, y, z));
                return { success: `Added ${element} at (${x}, ${y}, ${z})` };
            }

            // add mol <format>
            if (subCmd === 'mol' || subCmd === 'molecule') {
                // Parse flags
                // Parse flags
                const generate2D = args.includes('-2d');
                const generate3D = !generate2D; // Default to 3D unless -2d is specified
                const addHydrogens = args.includes('-h');
                const cleanArgs = args.filter(a => a !== '-3d' && a !== '-2d' && a !== '-h');

                if (cleanArgs.length < 2) return { error: 'Usage: add mol <format> [data] [-3d] [-h]' };
                const format = cleanArgs[1].toLowerCase();

                // Check for inline data (e.g. add mol smi "C1CCCCC1")
                if (cleanArgs.length > 2) {
                    const data = cleanArgs.slice(2).join(' ').replace(/^"|"$/g, ''); // Remove quotes
                    try {
                        if (format === 'smi' || format === 'smiles') {
                            this.editor.fileIOManager.importSMILES(data, {
                                shouldClear: false,
                                autoBond: false,
                                generate3D,
                                addHydrogens
                            }).then(result => {
                                if (result && result.error) {
                                    this.editor.console.print(`Error: ${result.error}`, 'error');
                                } else {
                                    this.editor.rebuildScene();
                                    this.editor.moleculeManager.updateUI();
                                    this.editor.console.print('SMILES imported successfully', 'success');
                                }
                            }).catch(err => {
                                this.editor.console.print(`Error: ${err.message}`, 'error');
                            });
                            return { success: 'Importing SMILES...' };
                        } else if (format === 'xyz') {
                            this.editor.fileIOManager.importXYZ(data, { shouldClear: false, autoBond: true });
                            this.editor.moleculeManager.updateUI();
                            return { success: 'Imported XYZ data' };
                        }
                        return { error: `Inline data not supported for ${format}` };
                    } catch (e) {
                        return { error: e.message };
                    }
                }

                if (['xyz', 'smi', 'smiles', 'sdf', 'mol'].includes(format)) {
                    // Interactive format mode
                    this.editor.console.startInputMode(`${format.toUpperCase()}> `, async (data) => {
                        try {
                            let result;
                            if (format === 'xyz') {
                                result = this.editor.fileIOManager.importXYZ(data, { shouldClear: false, autoBond: true });
                            } else if (format === 'smi' || format === 'smiles') {
                                result = await this.editor.fileIOManager.importSMILES(data, {
                                    shouldClear: false,
                                    autoBond: false,
                                    generate3D,
                                    addHydrogens
                                });
                            } else if (format === 'sdf' || format === 'mol') {
                                result = this.editor.fileIOManager.importSDF(data, { shouldClear: false, autoBond: false });
                            } else {
                                this.editor.console.print('Format not implemented', 'warning');
                                return;
                            }

                            if (result && result.error) {
                                this.editor.console.print(result.error, 'error');
                            } else if (result && result.success) {
                                this.editor.rebuildScene();
                                this.editor.console.print(result.success, 'success');
                            }
                        } catch (e) {
                            this.editor.console.print(e.message, 'error');
                        }
                    });
                    return null;
                }
                return { error: `Unknown format: ${format}` };
            }

            return { error: `Unknown subcommand: ${subCmd}. Use 'atom', 'bond', or 'mol'.` };
        });

        // Delete command (Consolidated)
        this.register('del', ['delete', 'rm', 'remove'], 'del [atom|mol|bond] ... - Delete objects', { isDestructive: true }, (args) => {
            if (args.length === 0) return { error: 'Usage: del [atom|mol|bond] ...' };

            const subCmd = args[0].toLowerCase();

            // del mol <index|name>
            if (subCmd === 'mol' || subCmd === 'molecule' || subCmd === 'mols') {
                if (args.length < 2) {
                    // Remove current
                    const result = this.editor.moleculeManager.removeMolecule(this.editor.moleculeManager.activeMoleculeIndex);
                    return result.error ? { error: result.error } : { success: result.success };
                }
                const target = args.slice(1).join(' ');
                let index = parseInt(target);
                if (isNaN(index)) {
                    index = this.editor.moleculeManager.molecules.findIndex(m => m.name === target);
                    if (index === -1) return { error: `Molecule "${target}" not found` };
                }
                const result = this.editor.moleculeManager.removeMolecule(index);
                return result.error ? { error: result.error } : { success: result.success };
            }

            // del bond <idx1> <idx2>
            if (subCmd === 'bond') {
                if (args.length !== 3) return { error: 'Usage: del bond <idx1> <idx2>' };
                const idx1 = parseInt(args[1]);
                const idx2 = parseInt(args[2]);
                const atom1 = this.editor.molecule.atoms[idx1];
                const atom2 = this.editor.molecule.atoms[idx2];
                if (!atom1 || !atom2) return { error: 'Invalid atom index' };
                const bond = this.editor.molecule.getBond(atom1, atom2);
                if (!bond) return { error: 'No bond found' };

                this.editor.removeBond(bond);
                return { success: `Removed bond ${idx1}-${idx2}` };
            }

            // del atom <indices>
            if (subCmd === 'atoms' || subCmd === 'atom') {
                const indicesArgs = args.slice(1);

                // Handle ':' (all)
                if (indicesArgs.length === 1 && indicesArgs[0] === ':') {
                    const count = this.editor.molecule.atoms.length;
                    if (count === 0) return { info: 'No atoms' };
                    this.editor.molecule.clear();
                    this.editor.rebuildScene();
                    return { success: `Deleted all ${count} atoms` };
                }

                // Parse indices
                const indices = [];
                for (const arg of indicesArgs) {
                    if (arg.includes(':')) {
                        const [start, end] = arg.split(':').map(Number);
                        if (isNaN(start) || isNaN(end)) return { error: `Invalid range: ${arg}` };
                        for (let i = start; i <= end; i++) indices.push(i);
                    } else {
                        const idx = parseInt(arg);
                        if (!isNaN(idx)) indices.push(idx);
                    }
                }

                if (indices.length === 0) return { error: 'No valid indices provided' };

                const toDelete = indices.map(i => this.editor.molecule.atoms[i]).filter(a => a);
                this.editor.clearSelection(); // Clear existing selection to avoid deleting them
                toDelete.forEach(a => a.selected = true);
                this.editor.deleteSelected();
                return { success: `Deleted ${toDelete.length} atom(s)` };
            }

            return { error: `Unknown subcommand: ${subCmd}. Use 'atom', 'bond', or 'mol'.` };
        });


        // Set command (Consolidated)
        this.register('set', [], 'set [dist|angle|dihedral|threshold|scale] ... - Set properties', { isDestructive: true }, (args) => {
            if (args.length < 2) return { error: 'Usage: set [property] [values...]' };

            const prop = args[0].toLowerCase();
            const vals = args.slice(1);

            if (prop === 'dist' || prop === 'distance') {
                if (vals.length !== 3) return { error: 'Usage: set dist <idx1> <idx2> <val>' };
                const idx1 = parseInt(vals[0]);
                const idx2 = parseInt(vals[1]);
                const val = parseFloat(vals[2]);
                if (isNaN(val) || val <= 0) return { error: 'Invalid distance' };

                const atom1 = this.editor.molecule.atoms[idx1];
                const atom2 = this.editor.molecule.atoms[idx2];
                if (!atom1 || !atom2) return { error: 'Invalid atoms' };

                this.editor.molecule.atoms.forEach(a => a.selected = false);
                atom1.selected = true; atom2.selected = true;
                this.editor.selectionOrder = [atom1, atom2];

                document.getElementById('input-length').value = val;
                this.editor.setBondLength();
                return { success: `Distance set to ${val}` };
            }

            if (prop === 'angle') {
                if (vals.length !== 4) return { error: 'Usage: set angle <idx1> <idx2> <idx3> <val>' };
                const idx1 = parseInt(vals[0]);
                const idx2 = parseInt(vals[1]);
                const idx3 = parseInt(vals[2]);
                const val = parseFloat(vals[3]);
                if (isNaN(val)) return { error: 'Invalid angle' };

                const atoms = [idx1, idx2, idx3].map(i => this.editor.molecule.atoms[i]);
                if (atoms.some(a => !a)) return { error: 'Invalid atoms' };

                this.editor.molecule.atoms.forEach(a => a.selected = false);
                atoms.forEach(a => a.selected = true);
                this.editor.selectionOrder = atoms;

                document.getElementById('input-angle').value = val;
                this.editor.setBondAngle();
                return { success: `Angle set to ${val}` };
            }

            if (prop === 'dihedral') {
                if (vals.length !== 5) return { error: 'Usage: set dihedral <idx1> <idx2> <idx3> <idx4> <val>' };
                const idx1 = parseInt(vals[0]);
                const idx2 = parseInt(vals[1]);
                const idx3 = parseInt(vals[2]);
                const idx4 = parseInt(vals[3]);
                const val = parseFloat(vals[4]);
                if (isNaN(val)) return { error: 'Invalid angle' };

                const atoms = [idx1, idx2, idx3, idx4].map(i => this.editor.molecule.atoms[i]);
                if (atoms.some(a => !a)) return { error: 'Invalid atoms' };

                this.editor.molecule.atoms.forEach(a => a.selected = false);
                atoms.forEach(a => a.selected = true);
                this.editor.selectionOrder = atoms;

                document.getElementById('input-dihedral').value = val;
                this.editor.setDihedralAngle();
                return { success: `Dihedral set to ${val}` };
            }

            if (prop === 'threshold') {
                const val = parseFloat(vals[0]);
                if (isNaN(val) || val <= 0) return { error: 'Invalid threshold' };
                document.getElementById('bond-threshold').value = val;
                document.getElementById('val-bond-threshold').textContent = val.toFixed(1);
                return { success: `Threshold set to ${val}` };
            }

            if (prop === 'scale') {
                if (vals.length !== 2) return { error: 'Usage: set scale [atom|bond] <value>' };
                const type = vals[0].toLowerCase();
                const val = parseFloat(vals[1]);

                if (isNaN(val) || val <= 0) return { error: 'Invalid scale value' };

                if (type === 'atom' || type === 'atoms') {
                    this.editor.renderManager.setAtomScale(val);
                    return { success: `Atom scale set to ${val}` };
                } else if (type === 'bond' || type === 'bonds') {
                    this.editor.renderManager.setBondScale(val);
                    return { success: `Bond scale set to ${val}` };
                } else {
                    return { error: 'Invalid type. Use "atom" or "bond"' };
                }
            }

            return { error: `Unknown property: ${prop}` };
        });

        // Measure command (Replaces info)
        this.register('measure', ['meas', 'info'], 'measure <idx...> - Measure geometry', (args) => {
            if (args.length === 0) {
                // Info behavior for selected
                const selected = this.editor.molecule.atoms.filter(a => a.selected);
                if (selected.length === 0) return { info: 'No atoms selected' };
                let output = '';
                selected.forEach(atom => {
                    const idx = this.editor.molecule.atoms.indexOf(atom);
                    const pos = atom.position;
                    output += `${idx}: ${atom.element} (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})\n`;
                });
                return { info: output };
            }

            const indices = args.map(a => parseInt(a));
            const atoms = indices.map(i => this.editor.molecule.atoms[i]);
            if (atoms.some(a => !a)) return { error: 'Invalid atom indices' };

            if (atoms.length === 2) {
                const dist = atoms[0].position.distanceTo(atoms[1].position);
                return { info: `Distance: ${dist.toFixed(3)} Å` };
            } else if (atoms.length === 3) {
                const v1 = atoms[0].position.clone().sub(atoms[1].position);
                const v2 = atoms[2].position.clone().sub(atoms[1].position);
                const angle = v1.angleTo(v2) * (180 / Math.PI);
                return { info: `Angle: ${angle.toFixed(2)}°` };
            } else if (atoms.length === 4) {
                // Dihedral calc
                const [a1, a2, a3, a4] = atoms.map(a => a.position);
                const b1 = a2.clone().sub(a1);
                const b2 = a3.clone().sub(a2);
                const b3 = a4.clone().sub(a3);
                const n1 = b1.clone().cross(b2).normalize();
                const n2 = b2.clone().cross(b3).normalize();
                let angle = Math.acos(Math.max(-1, Math.min(1, n1.dot(n2))));
                const sign = b1.dot(n2);
                if (sign < 0) angle = -angle;
                return { info: `Dihedral: ${(angle * 180 / Math.PI).toFixed(2)}°` };
            }

            return { error: 'Select 2, 3, or 4 atoms to measure' };
        });

        // Rebond command (was adjustbond)
        this.register('rebond', ['rb'], 'rebond - Recalculate bonds based on threshold', { isDestructive: true }, (args) => {
            // Clear all existing bonds
            this.editor.molecule.bonds = [];
            this.editor.molecule.atoms.forEach(atom => {
                atom.bonds = [];
            });

            // Auto bond
            const thresholdInput = document.getElementById('bond-threshold');
            const threshold = thresholdInput ? parseFloat(thresholdInput.value) : 1.1;
            const count = this.editor.moleculeManager.autoBond(threshold);

            // Rebuild scene to update visuals
            this.editor.rebuildScene();

            return { success: `Rebonded: ${count} bonds created` };
        });

        // Center command
        this.register('center', ['cen'], 'center - Move molecule center to (0,0,0)', { isDestructive: true }, (args) => {
            const atoms = this.editor.molecule.atoms;
            if (atoms.length === 0) return { info: 'No atoms' };

            const com = GeometryEngine.getCenterOfMass(atoms);
            const offset = com.clone().negate();

            atoms.forEach(atom => {
                atom.position.add(offset);
            });

            this.editor.rebuildScene();
            this.editor.saveState(); // Save after center
            return { success: 'Molecule centered' };
        });

        // Move command (mv) - supports atom, frag, mol
        this.register('mv', ['move'], 'mv [atom|frag|mol] [index] <x> <y> <z> - Move atom/fragment/molecule', { isDestructive: true }, (args) => {
            if (args.length < 4) {
                return { error: 'Usage: mv [atom|frag|mol] [index] <x> <y> <z>\nExamples:\n  mv atom 2 0 0 3\n  mv frag 1 0 0 3\n  mv mol 0 0 3' };
            }

            const type = args[0].toLowerCase();

            // mol type: mv mol x y z (no index)
            if (type === 'mol' || type === 'molecule') {
                const [x, y, z] = args.slice(1).map(parseFloat);

                if (isNaN(x) || isNaN(y) || isNaN(z)) {
                    return { error: 'Invalid coordinates' };
                }

                const atoms = this.editor.molecule.atoms;
                const positions = atoms.map(a => a.position);
                const newPositions = GeometryEngine.getTranslatedPositions(positions, x, y, z);

                atoms.forEach((atom, i) => {
                    atom.position.copy(newPositions[i]);
                });

                this.editor.rebuildScene();
                this.editor.saveState();
                return { success: `Moved molecule by (${x}, ${y}, ${z})` };
            }

            // atom/frag type: mv atom/frag index x y z
            if (type === 'atom' || type === 'frag' || type === 'fragment') {
                if (args.length < 5) {
                    return { error: `Usage: mv ${type} <index> <x> <y> <z>` };
                }

                const index = parseInt(args[1]);
                const [x, y, z] = args.slice(2).map(parseFloat);

                if (isNaN(index) || isNaN(x) || isNaN(y) || isNaN(z)) {
                    return { error: 'Invalid index or coordinates' };
                }

                if (type === 'atom') {
                    const atom = this.editor.molecule.atoms[index];
                    if (!atom) return { error: `Invalid atom index: ${index}` };

                    atom.position.add(new THREE.Vector3(x, y, z));
                    this.editor.rebuildScene();
                    this.editor.saveState();
                    return { success: `Moved atom ${index} by (${x}, ${y}, ${z})` };
                }

                if (type === 'frag' || type === 'fragment') {
                    const fragments = this.editor.fileIOManager.getFragments();
                    if (index >= fragments.length || index < 0) {
                        return { error: `Invalid fragment index: ${index} (${fragments.length} fragments)` };
                    }

                    const offset = new THREE.Vector3(x, y, z);
                    fragments[index].forEach(atom => {
                        atom.position.add(offset);
                    });

                    this.editor.rebuildScene();
                    this.editor.saveState();
                    return { success: `Moved fragment ${index} by (${x}, ${y}, ${z})` };
                }
            }

            return { error: 'Invalid type. Use: atom, frag, or mol' };
        });

        // Rotate command (rot) - supports frag, mol only (no atom)
        this.register('rot', ['rotate'], 'rot [frag|mol] [index] <x> <y> <z> - Rotate fragment/molecule (degrees)', { isDestructive: true }, (args) => {
            if (args.length < 4) {
                return { error: 'Usage: rot [frag|mol] [index] <x> <y> <z>\nExamples:\n  rot frag 1 90 0 0\n  rot mol 0 90 0' };
            }

            const type = args[0].toLowerCase();

            // mol type: rot mol x y z (no index)
            if (type === 'mol' || type === 'molecule') {
                const [x, y, z] = args.slice(1).map(parseFloat);

                if (isNaN(x) || isNaN(y) || isNaN(z)) {
                    return { error: 'Invalid angles' };
                }

                const atoms = this.editor.molecule.atoms;
                const positions = atoms.map(a => a.position);
                const newPositions = GeometryEngine.getRotatedPositions(positions, x, y, z);

                atoms.forEach((atom, i) => {
                    atom.position.copy(newPositions[i]);
                });

                this.editor.rebuildScene();
                this.editor.saveState();
                return { success: `Rotated molecule by (${x}, ${y}, ${z})` };
            }

            // frag type: rot frag index x y z
            if (type === 'frag' || type === 'fragment') {
                if (args.length < 5) {
                    return { error: 'Usage: rot frag <index> <x> <y> <z>' };
                }

                const index = parseInt(args[1]);
                const [x, y, z] = args.slice(2).map(parseFloat);

                if (isNaN(index) || isNaN(x) || isNaN(y) || isNaN(z)) {
                    return { error: 'Invalid index or angles' };
                }

                const fragments = this.editor.fileIOManager.getFragments();
                if (index >= fragments.length || index < 0) {
                    return { error: `Invalid fragment index: ${index} (${fragments.length} fragments)` };
                }

                const fragAtoms = fragments[index];

                // Calculate fragment centroid
                const centroid = GeometryEngine.getCenterOfMass(fragAtoms);

                // Translate to origin, rotate, translate back
                const positions = fragAtoms.map(a => a.position.clone().sub(centroid));
                const rotated = GeometryEngine.getRotatedPositions(positions, x, y, z);

                fragAtoms.forEach((atom, i) => {
                    atom.position.copy(rotated[i].add(centroid));
                });

                this.editor.rebuildScene();
                this.editor.saveState();
                return { success: `Rotated fragment ${index} by (${x}, ${y}, ${z})` };
            }

            return { error: 'Invalid type. Use: frag or mol (atom rotation not supported)' };
        });

        // Keep old aliases for backward compatibility
        this.register('trans', ['tr', 'translation'], 'trans <x> <y> <z> - Translate molecule (alias for mv mol)', { isDestructive: true }, (args) => {
            if (args.length !== 3) return { error: 'Usage: trans <x> <y> <z> (or use: mv mol <x> <y> <z>)' };
            // Delegate to mv mol
            const mvCommand = this.get('mv');
            return mvCommand.execute(['mol', ...args]);
        });

        // Select command (Preserved)
        this.register('select', ['sel'], 'select <indices|frag index> - Select atoms or fragment', (args) => {
            if (args.length === 0) return { error: 'Usage: select <indices> or select frag <index>' };

            // Select all atoms
            if (args[0] === ':') {
                this.editor.clearSelection();
                this.editor.molecule.atoms.forEach(a => {
                    a.selected = true;
                    this.editor.selectionOrder.push(a);
                    this.editor.updateAtomVisuals(a);
                });
                this.editor.updateSelectionInfo();
                return { success: 'Selected all' };
            }

            // Select fragment
            if (args[0].toLowerCase() === 'frag' || args[0].toLowerCase() === 'fragment') {
                if (args.length < 2) return { error: 'Usage: select frag <index>' };
                const fragIndex = parseInt(args[1]);
                if (isNaN(fragIndex)) return { error: 'Invalid fragment index' };

                const fragments = this.editor.fileIOManager.getFragments();
                if (fragIndex < 0 || fragIndex >= fragments.length) {
                    return { error: `Invalid fragment index: ${fragIndex} (${fragments.length} fragments)` };
                }

                this.editor.clearSelection();
                fragments[fragIndex].forEach(atom => {
                    atom.selected = true;
                    this.editor.selectionOrder.push(atom);
                    this.editor.updateAtomVisuals(atom);
                });
                this.editor.updateSelectionInfo();
                return { success: `Selected fragment ${fragIndex} (${fragments[fragIndex].length} atoms)` };
            }

            // Parse atom indices
            const indices = [];
            const invalidArgs = [];
            for (const arg of args) {
                if (arg.includes(':')) {
                    const [s, e] = arg.split(':').map(Number);
                    if (isNaN(s) || isNaN(e)) {
                        invalidArgs.push(arg);
                        continue;
                    }
                    for (let i = s; i <= e; i++) indices.push(i);
                } else {
                    const idx = parseInt(arg);
                    if (isNaN(idx)) {
                        invalidArgs.push(arg);
                        continue;
                    }
                    indices.push(idx);
                }
            }

            if (indices.length === 0) {
                return { error: `No valid indices provided. Invalid: ${invalidArgs.join(', ')}` };
            }

            this.editor.clearSelection();
            let selectedCount = 0;
            indices.forEach(i => {
                const atom = this.editor.molecule.atoms[i];
                if (atom) {
                    atom.selected = true;
                    this.editor.selectionOrder.push(atom);
                    this.editor.updateAtomVisuals(atom);
                    selectedCount++;
                }
            });
            this.editor.updateSelectionInfo();

            let msg = `Selected ${selectedCount} atom(s)`;
            if (invalidArgs.length > 0) {
                msg += ` (ignored invalid: ${invalidArgs.join(', ')})`;
            }
            return { success: msg };
        });

        // Utility Commands
        this.register('clear', ['cls'], 'clear - Clear console', () => {
            this.editor.console.clear();
            return null;
        });

        this.register('time', ['sleep'], 'time <sec> - Wait', (args) => {
            if (args.length === 0) return { error: 'Usage: time <sec>' };
            const sec = parseFloat(args[0]);
            if (isNaN(sec) || sec < 0) return { error: 'Invalid time value' };
            return new Promise(r => setTimeout(() => r({ info: `Waited ${sec}s` }), sec * 1000));
        });

        this.register('camera', ['cam'], 'camera [orbit|trackball]', (args) => {
            if (args.length === 0) return { error: 'Usage: camera [orbit|trackball]' };
            const mode = args[0].toLowerCase();
            if (!['orbit', 'trackball'].includes(mode)) {
                return { error: 'Invalid mode. Use: orbit or trackball' };
            }
            this.editor.renderer.setCameraMode(mode);
            document.getElementById('camera-mode').value = mode;
            return { success: `Camera: ${mode}` };
        });

        this.register('projection', ['proj'], 'projection [persp|ortho]', (args) => {
            if (args.length === 0) return { error: 'Usage: projection [persp|ortho]' };
            const arg = args[0].toLowerCase();
            let mode = 'perspective';
            if (['orthographic', 'ortho', 'ot'].includes(arg)) mode = 'orthographic';
            else if (['perspective', 'persp', 'ps'].includes(arg)) mode = 'perspective';
            this.editor.renderer.setProjection(mode);
            document.getElementById('projection-mode').value = mode;
            return { success: `Projection: ${mode}` };
        });

        // Molecule Management (New Standard)
        this.register('new', [], 'new [name]', (args) => {
            const name = args.join(' ');
            const res = this.editor.moleculeManager.createMolecule(name);
            return res.error ? { error: res.error } : { success: `Created ${res.name}` };
        });

        this.register('switch', ['sw'], 'switch <index|name>', (args) => {
            const target = args.join(' ');
            let idx = parseInt(target);
            if (isNaN(idx)) idx = this.editor.moleculeManager.molecules.findIndex(m => m.name === target);
            if (idx === -1) return { error: 'Not found' };
            const res = this.editor.moleculeManager.switchMolecule(idx);
            return res.error ? { error: res.error } : { success: res.success };
        });

        this.register('rename', ['rn'], 'rename <name>', (args) => {
            const name = args.join(' ');
            const res = this.editor.moleculeManager.renameMolecule(this.editor.moleculeManager.activeMoleculeIndex, name);
            return res.error ? { error: res.error } : { success: res.success };
        });

        // Clipboard
        this.register('copy', ['cp'], 'copy', () => {
            const res = this.editor.moleculeManager.copySelection();
            return res.error ? { error: res.error } : { success: res.success };
        });

        this.register('paste', ['pa'], 'paste [--offset <val>]', (args) => {
            let dist = 0;
            const idx = args.indexOf('--offset') !== -1 ? args.indexOf('--offset') : args.indexOf('-o');
            if (idx !== -1) dist = parseFloat(args[idx + 1]);
            const res = this.editor.moleculeManager.pasteClipboard(dist);
            return res.error ? { error: res.error } : { success: res.success };
        });

        this.register('cut', ['ct'], 'cut', { isDestructive: true }, () => {
            const cp = this.editor.moleculeManager.copySelection();
            if (cp.error) return { error: cp.error };
            this.editor.deleteSelected();
            return { success: 'Cut selected atoms' };
        });

        this.register('merge', ['mg'], 'merge <index|name>', (args) => {
            const target = args.join(' ');
            let idx = parseInt(target);
            if (isNaN(idx)) idx = this.editor.moleculeManager.molecules.findIndex(m => m.name === target);
            const res = this.editor.moleculeManager.mergeMolecule(idx);
            return res.error ? { error: res.error } : { success: res.success };
        });



        // Label command
        this.register('label', ['lbl'], 'label [-s|-n|-a|-o]', (args) => {
            if (args.length === 0) return { error: 'Usage: label [-s|-n|-a|-o] (symbol/number/all/off)' };
            const arg = args[0];
            let mode = 'none';
            if (arg === '-s' || arg === '--symbol') mode = 'symbol';
            else if (arg === '-n' || arg === '--number') mode = 'number';
            else if (arg === '-a' || arg === '--all') mode = 'both';
            else if (arg === '-o' || arg === '--off') mode = 'none';
            else return { error: `Unknown option: ${arg}. Use: -s, -n, -a, or -o` };

            this.editor.labelMode = mode;
            this.editor.updateAllLabels();
            return { success: `Label mode: ${mode}` };
        });

        // Undo/Redo
        this.register('undo', ['u'], 'undo - Undo last action', () => {
            this.editor.undo();
            return { success: 'Undid last action' };
        });

        this.register('redo', ['r', 'y'], 'redo - Redo last action', () => {
            this.editor.redo();
            return { success: 'Redid last action' };
        });

        this.register('debug_conn', [], 'debug_conn - Check connectivity', () => {
            const selected = this.editor.molecule.atoms.filter(a => a.selected);
            if (selected.length === 0) return { error: 'Select an atom' };

            const info = selected.map(a => {
                return `Atom ${a.element}(${a.id}): ${a.bonds.length} bonds. Connected to: ${a.bonds.map(b => {
                    const other = b.atom1 === a ? b.atom2 : b.atom1;
                    return `${other.element}(${other.id})`;
                }).join(', ')}`;
            });

            return { info: info.join('\n') };
        });

        // Substitute Command
        this.register('substitute', ['sub'], 'sub atom <idx> <elem> | sub grp ...', (args) => {
            if (args.length < 2) return { error: 'Usage: sub atom <idx> <elem> OR sub grp ...' };

            const subCmd = args[0].toLowerCase();

            if (subCmd === 'atom') {
                // sub atom <idx> <elem>
                if (args.length < 3) return { error: 'Usage: sub atom <index> <element>' };

                const idx = parseInt(args[1]); // 0-based
                const element = args[2];

                if (isNaN(idx) || idx < 0 || idx >= this.editor.molecule.atoms.length) {
                    return { error: `Invalid atom index: ${args[1]}` };
                }

                // Validate element (simple check)
                if (!element || element.length > 2) {
                    return { error: `Invalid element: ${element}` };
                }

                // Update visuals
                this.editor.rebuildScene();
                this.editor.saveState(); // Save after substitution

                return { success: `Changed atom ${args[1]} to ${element}` };
            } else if (subCmd === 'grp' || subCmd === 'group') {
                // Delegate to MoleculeManager for complex group substitution
                return this.editor.moleculeManager.substituteGroup(args.slice(1));
            }

            return { error: `Unknown subcommand: ${subCmd}` };
        });

        // Add Hydrogens Command
        this.register('addh', ['add_hydrogens'], 'addh - Add explicit hydrogens', { isDestructive: true }, async () => {
            const res = await this.editor.moleculeManager.addExplicitHydrogens();
            return res.error ? { error: res.error } : { success: res.success };
        });

        // Optimize Command
        this.register('optimize', ['opt', 'minimize'], 'optimize [method] - Optimize geometry (default: ff)', { isDestructive: true }, async (args) => {
            const method = args.length > 0 ? args[0] : 'ff';
            const res = await this.editor.moleculeManager.optimizeGeometry(method);
            return res.error ? { error: res.error } : { success: res.success };
        });


        // Export Command
        this.register('export', ['exp'], 'export <format> [-s] - Export molecule', (args) => {
            if (args.length === 0) return { error: 'Usage: export <format> [-s|--split]' };

            const format = args[0].toLowerCase();
            const splitFragments = args.includes('-s') || args.includes('--split');

            try {
                if (format === 'xyz') {
                    const data = this.editor.fileIOManager.exportXYZ({ splitFragments });
                    if (!data) return { warning: 'No atoms to export' };
                    return { info: data };
                } else if (format === 'smi' || format === 'smiles') {
                    return this.editor.fileIOManager.exportSMILES({ splitFragments }).then(data => {
                        return { info: data };
                    });
                } else if (format === 'sdf' || format === 'mol') {
                    const data = this.editor.fileIOManager.exportSDF({ splitFragments });
                    return { info: data };
                } else {
                    return { error: `Unknown format: ${format}. Supported: xyz, smi, sdf` };
                }
            } catch (e) {
                return { error: e.message };
            }
        });

        // Show Command (Unified 2D/3D)
        this.register('show', [], 'show <2d|3d> [options] - Show visualization', async (args) => {
            if (args.length === 0) return { error: 'Usage: show <2d|3d> [options]' };

            const subCmd = args[0].toLowerCase();

            // show 3d [-n|--no-bg]
            if (subCmd === '3d') {
                const noBg = args.includes('--no-background') || args.includes('-n');
                const objects = [];
                this.editor.renderer.scene.traverse(obj => {
                    if (obj.userData && obj.userData.type === 'atom') objects.push(obj);
                });
                try {
                    const dataURL = this.editor.renderer.captureSnapshot(objects, noBg);
                    return { info: dataURL, type: 'image' };
                } catch (e) {
                    return { error: `Capture failed: ${e.message}` };
                }
            }

            // show 2d [-s|--split] [-l|--label] [-h|--hydrogen] [-p|--png]
            if (subCmd === '2d') {
                const splitFragments = args.includes('-s') || args.includes('--split');
                const showLabels = args.includes('-l') || args.includes('--label');
                const showHydrogens = args.includes('-h') || args.includes('--hydrogen');
                const usePng = args.includes('-p') || args.includes('--png');

                try {
                    let svgs;
                    if (usePng) {
                        svgs = await this.editor.fileIOManager.exportPNG({ splitFragments, showLabels, showHydrogens });
                    } else {
                        svgs = this.editor.fileIOManager.exportSVG({ splitFragments, showLabels, showHydrogens });
                    }

                    if (Array.isArray(svgs)) {
                        let count = 0;
                        for (const svg of svgs) {
                            if (svg) {
                                let blob;
                                if (usePng) {
                                    blob = await (await fetch(svg)).blob();
                                } else {
                                    blob = new Blob([svg], { type: 'image/svg+xml' });
                                }
                                const url = URL.createObjectURL(blob);
                                this.editor.console.print(url, 'image');
                                count++;
                            }
                        }
                        return { success: `Shown ${count} fragments` };
                    } else {
                        if (!svgs) return { warning: 'No molecule to show' };
                        let url;
                        if (usePng) {
                            const blob = await (await fetch(svgs)).blob();
                            url = URL.createObjectURL(blob);
                        } else {
                            const blob = new Blob([svgs], { type: 'image/svg+xml' });
                            url = URL.createObjectURL(blob);
                        }
                        return { info: url, type: 'image' };
                    }
                } catch (e) {
                    return { error: `Show 2D failed: ${e.message}` };
                }
            }

            return { error: `Unknown subcommand: ${subCmd}` };
        });
    }
}
