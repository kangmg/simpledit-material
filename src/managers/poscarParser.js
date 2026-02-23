import * as THREE from 'three';
import { Crystal, LatticeParams } from '../crystal.js';

/**
 * Parser and generator for VASP POSCAR / CONTCAR format.
 *
 * Supported variants:
 *  - VASP 5+: element names on line 6, counts on line 7
 *  - VASP 4:  counts on line 6 (element names inferred as A, B, ...)
 *  - Coordinate modes: Direct (fractional) and Cartesian
 *  - Selective dynamics block (skipped)
 *  - Negative scale factor treated as absolute cell volume (approximate)
 *
 * File layout (VASP 5):
 *   Line 1  : comment / structure name
 *   Line 2  : universal scale factor
 *   Lines 3-5: lattice vectors a1, a2, a3 (one per line, 3 floats)
 *   Line 6  : element symbols  (VASP 5) or counts (VASP 4)
 *   Line 7  : atom counts      (VASP 5)
 *   Line 8  : "Selective dynamics" (optional)
 *   Line 9  : "Direct" or "Cartesian"
 *   Lines 10+: atom positions
 */
export class POSCARParser {
    /**
     * Parse POSCAR/CONTCAR content into a Crystal object.
     * @param {string} content
     * @returns {Crystal}
     */
    static parse(content) {
        const raw = content.split('\n');
        // Filter out completely empty trailing lines but keep internal structure
        const lines = raw.map(l => l.trimEnd());

        if (lines.length < 9) throw new Error('POSCAR: file too short');

        // Line 1: comment / name
        const name = lines[0].trim() || 'POSCAR';

        // Line 2: universal scale factor
        let scaleFactor = parseFloat(lines[1]) || 1.0;
        // Negative scale → volume target (not supported exactly; use |scale| as approx)
        if (scaleFactor < 0) scaleFactor = Math.abs(scaleFactor);

        // Lines 3-5: lattice vectors
        const parseVec = line => {
            const p = line.trim().split(/\s+/).map(Number);
            return new THREE.Vector3(p[0] * scaleFactor, p[1] * scaleFactor, p[2] * scaleFactor);
        };
        const va = parseVec(lines[2]);
        const vb = parseVec(lines[3]);
        const vc = parseVec(lines[4]);

        const lattice = this._vectorsToLatticeParams(va, vb, vc);

        // Line 6: element names (VASP 5) or counts (VASP 4)?
        const line6Tokens = lines[5].trim().split(/\s+/);
        let elementNames, counts, coordLineOffset;

        if (isNaN(Number(line6Tokens[0]))) {
            // VASP 5: element names on line 6, counts on line 7
            elementNames = line6Tokens;
            counts = lines[6].trim().split(/\s+/).map(Number);
            coordLineOffset = 7; // Next line after counts
        } else {
            // VASP 4: counts on line 6
            counts = line6Tokens.map(Number);
            elementNames = counts.map((_, i) => String.fromCharCode(65 + i)); // A, B, C, ...
            coordLineOffset = 6;
        }

        // Optional: Selective dynamics
        const coordModeRaw = lines[coordLineOffset].trim().toLowerCase();
        let coordMode;
        if (coordModeRaw.startsWith('s')) {
            // Selective dynamics present: skip it
            coordLineOffset++;
            coordMode = lines[coordLineOffset].trim().toLowerCase();
        } else {
            coordMode = coordModeRaw;
        }
        coordLineOffset++; // Now points to first atom position line

        const isDirect = coordMode.startsWith('d');

        // Build crystal
        const crystal = new Crystal(name);
        crystal.setLattice(lattice);

        let atomIdx = 0;
        for (let ei = 0; ei < elementNames.length; ei++) {
            const elem = elementNames[ei].trim();
            const count = counts[ei] || 0;
            for (let ai = 0; ai < count; ai++) {
                const lineIdx = coordLineOffset + atomIdx;
                if (lineIdx >= lines.length) break;

                const parts = lines[lineIdx].trim().split(/\s+/);
                const p0 = parseFloat(parts[0]) || 0;
                const p1 = parseFloat(parts[1]) || 0;
                const p2 = parseFloat(parts[2]) || 0;

                if (isDirect) {
                    crystal.addAtomFractional(elem, p0, p1, p2);
                } else {
                    // Cartesian (already scaled by scaleFactor at vector level)
                    const frac = lattice.cartToFrac(
                        p0 * scaleFactor,
                        p1 * scaleFactor,
                        p2 * scaleFactor
                    );
                    crystal.addAtomFractional(elem, frac.x, frac.y, frac.z);
                }
                atomIdx++;
            }
        }

        return crystal;
    }

    /**
     * Convert three lattice vectors to LatticeParams (a, b, c, alpha, beta, gamma).
     */
    static _vectorsToLatticeParams(va, vb, vc) {
        const a = va.length();
        const b = vb.length();
        const c = vc.length();
        const clamp = v => Math.max(-1, Math.min(1, v));
        const alpha = Math.acos(clamp(vb.dot(vc) / (b * c))) * (180 / Math.PI);
        const beta  = Math.acos(clamp(va.dot(vc) / (a * c))) * (180 / Math.PI);
        const gamma = Math.acos(clamp(va.dot(vb) / (a * b))) * (180 / Math.PI);
        return new LatticeParams(a, b, c, alpha, beta, gamma);
    }

    /**
     * Generate POSCAR text (VASP 5 format, Direct coordinates).
     * @param {Crystal} crystal
     * @param {string} [name] Optional comment line override
     * @returns {string}
     */
    static generate(crystal, name) {
        if (!crystal.lattice) throw new Error('Crystal has no lattice parameters');
        const { a: va, b: vb, c: vc } = crystal.lattice.toLatticeVectors();
        const comment = name || crystal.name || 'Structure';

        // Collect element order (preserving first-occurrence order)
        const elemOrder = [];
        const elemGroups = {};
        crystal.atoms.forEach(atom => {
            if (!elemGroups[atom.element]) {
                elemOrder.push(atom.element);
                elemGroups[atom.element] = [];
            }
            elemGroups[atom.element].push(atom);
        });

        const fmt = (n, digits = 10) => n.toFixed(digits).padStart(digits + 4);

        const lines = [];
        lines.push(comment);
        lines.push('   1.0');
        lines.push(`${fmt(va.x)}  ${fmt(va.y)}  ${fmt(va.z)}`);
        lines.push(`${fmt(vb.x)}  ${fmt(vb.y)}  ${fmt(vb.z)}`);
        lines.push(`${fmt(vc.x)}  ${fmt(vc.y)}  ${fmt(vc.z)}`);
        lines.push(`   ${elemOrder.join('   ')}`);
        lines.push(`   ${elemOrder.map(e => String(elemGroups[e].length)).join('   ')}`);
        lines.push('Direct');

        elemOrder.forEach(elem => {
            elemGroups[elem].forEach(atom => {
                let frac = crystal.getFrac(atom);
                if (!frac) {
                    const f = crystal.lattice.cartToFrac(
                        atom.position.x, atom.position.y, atom.position.z
                    );
                    frac = { x: f.x, y: f.y, z: f.z };
                }
                lines.push(`${fmt(frac.x)}  ${fmt(frac.y)}  ${fmt(frac.z)}   ${elem}`);
            });
        });

        return lines.join('\n') + '\n';
    }
}
