import * as THREE from 'three';
import { Atom, Bond, Molecule } from './molecule.js';

/**
 * Lattice parameters for a crystal structure.
 * Stores conventional cell parameters (a, b, c in Angstroms; angles in degrees)
 * and provides conversion between fractional and Cartesian coordinates.
 */
export class LatticeParams {
    /**
     * @param {number} a - Length of a-vector (Angstroms)
     * @param {number} b - Length of b-vector (Angstroms)
     * @param {number} c - Length of c-vector (Angstroms)
     * @param {number} alpha - Angle between b and c (degrees)
     * @param {number} beta  - Angle between a and c (degrees)
     * @param {number} gamma - Angle between a and b (degrees)
     */
    constructor(a = 5, b = 5, c = 5, alpha = 90, beta = 90, gamma = 90) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.alpha = alpha;
        this.beta = beta;
        this.gamma = gamma;
    }

    /**
     * Convert angles to lattice vectors using the standard crystallographic convention.
     * a-vector lies along x-axis, b-vector in the xy-plane.
     * @returns {{ a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3 }}
     */
    toLatticeVectors() {
        const deg = Math.PI / 180;
        const { a, b, c } = this;
        const al = this.alpha * deg;
        const be = this.beta  * deg;
        const ga = this.gamma * deg;

        const va = new THREE.Vector3(a, 0, 0);
        const vb = new THREE.Vector3(b * Math.cos(ga), b * Math.sin(ga), 0);

        const cx = c * Math.cos(be);
        const cy = c * (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / Math.sin(ga);
        const czSq = c * c - cx * cx - cy * cy;
        const cz = czSq > 1e-12 ? Math.sqrt(czSq) : 0;
        const vc = new THREE.Vector3(cx, cy, cz);

        return { a: va, b: vb, c: vc };
    }

    /**
     * Convert fractional coordinates to Cartesian.
     * @param {number} fx
     * @param {number} fy
     * @param {number} fz
     * @returns {THREE.Vector3}
     */
    fracToCart(fx, fy, fz) {
        const { a, b, c } = this.toLatticeVectors();
        return new THREE.Vector3(
            fx * a.x + fy * b.x + fz * c.x,
            fx * a.y + fy * b.y + fz * c.y,
            fx * a.z + fy * b.z + fz * c.z
        );
    }

    /**
     * Convert Cartesian coordinates to fractional.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {THREE.Vector3} Fractional coordinates
     */
    cartToFrac(x, y, z) {
        const { a, b, c } = this.toLatticeVectors();
        // Build column-major matrix M = [a|b|c], then invert
        const M = new THREE.Matrix3().set(
            a.x, b.x, c.x,
            a.y, b.y, c.y,
            a.z, b.z, c.z
        );
        return new THREE.Vector3(x, y, z).applyMatrix3(M.clone().invert());
    }

    /** Unit cell volume in Å³ */
    volume() {
        const { a, b, c } = this.toLatticeVectors();
        return Math.abs(new THREE.Vector3().crossVectors(b, c).dot(a));
    }

    /**
     * Apply minimum image convention to a displacement vector.
     * Returns the shortest-image equivalent of (dx, dy, dz) under PBC.
     * @param {number} dx
     * @param {number} dy
     * @param {number} dz
     * @returns {THREE.Vector3}
     */
    minimumImage(dx, dy, dz) {
        const frac = this.cartToFrac(dx, dy, dz);
        frac.x -= Math.round(frac.x);
        frac.y -= Math.round(frac.y);
        frac.z -= Math.round(frac.z);
        return this.fracToCart(frac.x, frac.y, frac.z);
    }

    toJSON() {
        return {
            a: this.a, b: this.b, c: this.c,
            alpha: this.alpha, beta: this.beta, gamma: this.gamma
        };
    }

    static fromJSON(d) {
        return new LatticeParams(d.a, d.b, d.c, d.alpha, d.beta, d.gamma);
    }

    toString() {
        return (
            `a=${this.a.toFixed(4)} Å  b=${this.b.toFixed(4)} Å  c=${this.c.toFixed(4)} Å  ` +
            `α=${this.alpha.toFixed(3)}°  β=${this.beta.toFixed(3)}°  γ=${this.gamma.toFixed(3)}°`
        );
    }
}

/**
 * Crystal structure: a periodic solid with a unit cell.
 * Extends Molecule so that existing rendering and selection code works unchanged.
 * Adds:
 *   - lattice (LatticeParams)
 *   - fractional coordinates for each atom
 *   - space-group metadata
 *   - wrap(), generateSupercell()
 */
export class Crystal extends Molecule {
    constructor(name = 'Crystal') {
        super(name);
        /** @type {LatticeParams|null} */
        this.lattice = null;
        /** @type {string|null} Space group H-M symbol */
        this.spaceGroup = null;
        /** @type {number|null} IT number */
        this.spaceGroupNumber = null;
        /** @type {Map<number, {x:number, y:number, z:number}>} atomId -> fractional coords */
        this.fracCoords = new Map();
        /** Marker so code can distinguish Crystal from Molecule */
        this.isCrystal = true;
    }

    setLattice(params) {
        this.lattice = params;
    }

    /**
     * Add an atom using fractional coordinates.
     * Also stores Cartesian position for rendering.
     */
    addAtomFractional(element, fx, fy, fz) {
        if (!this.lattice) throw new Error('Crystal: lattice not set');
        const cart = this.lattice.fracToCart(fx, fy, fz);
        const atom = super.addAtom(element, cart);
        this.fracCoords.set(atom.id, { x: fx, y: fy, z: fz });
        return atom;
    }

    /** Get stored fractional coordinates of an atom (or null). */
    getFrac(atom) {
        return this.fracCoords.get(atom.id) || null;
    }

    /**
     * Wrap all atoms into the unit cell [0, 1).
     * Updates both fracCoords and Cartesian positions.
     */
    wrapAtoms() {
        if (!this.lattice) return;
        this.atoms.forEach(atom => {
            let frac = this.getFrac(atom);
            if (!frac) {
                const f = this.lattice.cartToFrac(atom.position.x, atom.position.y, atom.position.z);
                frac = { x: f.x, y: f.y, z: f.z };
                this.fracCoords.set(atom.id, frac);
            }
            frac.x = ((frac.x % 1) + 1) % 1;
            frac.y = ((frac.y % 1) + 1) % 1;
            frac.z = ((frac.z % 1) + 1) % 1;
            const cart = this.lattice.fracToCart(frac.x, frac.y, frac.z);
            atom.position.copy(cart);
        });
    }

    /**
     * Generate a supercell by repeating the unit cell na × nb × nc times.
     * @param {number} na
     * @param {number} nb
     * @param {number} nc
     * @returns {Crystal}
     */
    generateSupercell(na, nb, nc) {
        if (!this.lattice) throw new Error('Crystal: lattice not set');
        const sc = new Crystal(`${this.name} ${na}×${nb}×${nc}`);
        sc.setLattice(new LatticeParams(
            this.lattice.a * na,
            this.lattice.b * nb,
            this.lattice.c * nc,
            this.lattice.alpha,
            this.lattice.beta,
            this.lattice.gamma
        ));
        sc.spaceGroup = this.spaceGroup;
        sc.spaceGroupNumber = this.spaceGroupNumber;

        for (let ia = 0; ia < na; ia++) {
            for (let ib = 0; ib < nb; ib++) {
                for (let ic = 0; ic < nc; ic++) {
                    this.atoms.forEach(atom => {
                        let frac = this.getFrac(atom);
                        if (!frac) {
                            const f = this.lattice.cartToFrac(
                                atom.position.x, atom.position.y, atom.position.z
                            );
                            frac = { x: f.x, y: f.y, z: f.z };
                        }
                        sc.addAtomFractional(
                            atom.element,
                            (frac.x + ia) / na,
                            (frac.y + ib) / nb,
                            (frac.z + ic) / nc
                        );
                    });
                }
            }
        }

        // Rebuild bonds via PBC autobond (caller should trigger rebuildScene)
        return sc;
    }

    toJSON() {
        const base = super.toJSON();
        return {
            ...base,
            isCrystal: true,
            lattice: this.lattice ? this.lattice.toJSON() : null,
            spaceGroup: this.spaceGroup,
            spaceGroupNumber: this.spaceGroupNumber,
            fracCoords: this.atoms.map(a => {
                const f = this.fracCoords.get(a.id);
                return f ? { id: a.id, fx: f.x, fy: f.y, fz: f.z } : null;
            }).filter(Boolean)
        };
    }

    fromJSON(data) {
        super.fromJSON(data);
        this.isCrystal = true;
        this.lattice = data.lattice ? LatticeParams.fromJSON(data.lattice) : null;
        this.spaceGroup = data.spaceGroup || null;
        this.spaceGroupNumber = data.spaceGroupNumber || null;
        this.fracCoords = new Map();
        if (data.fracCoords) {
            data.fracCoords.forEach(fc => {
                this.fracCoords.set(fc.id, { x: fc.fx, y: fc.fy, z: fc.fz });
            });
        }
    }
}
