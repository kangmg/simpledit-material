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

        const sinGa = Math.sin(ga);
        if (Math.abs(sinGa) < 1e-10) {
            throw new Error(`Degenerate lattice: gamma = ${this.gamma}° (sin γ ≈ 0)`);
        }
        const cx = c * Math.cos(be);
        const cy = c * (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / sinGa;
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
        const Minv = M.clone();
        if (Minv.determinant() === 0) {
            throw new Error('Singular lattice matrix: cannot convert Cartesian to fractional');
        }
        return new THREE.Vector3(x, y, z).applyMatrix3(Minv.invert());
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

    /**
     * Build LatticeParams from three Cartesian lattice vectors.
     * @param {THREE.Vector3} va  @param {THREE.Vector3} vb  @param {THREE.Vector3} vc
     * @returns {LatticeParams}
     */
    static fromVectors(va, vb, vc) {
        const a = va.length(), b = vb.length(), c = vc.length();
        const clamp = v => Math.max(-1, Math.min(1, v));
        const alpha = Math.acos(clamp(vb.dot(vc) / (b * c))) * (180 / Math.PI);
        const beta  = Math.acos(clamp(va.dot(vc) / (a * c))) * (180 / Math.PI);
        const gamma = Math.acos(clamp(va.dot(vb) / (a * b))) * (180 / Math.PI);
        return new LatticeParams(a, b, c, alpha, beta, gamma);
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
        if (!isFinite(fx) || !isFinite(fy) || !isFinite(fz)) {
            throw new Error(`Invalid fractional coordinates for ${element}: (${fx}, ${fy}, ${fz})`);
        }
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
     * Return fractional coordinates for an atom, falling back to computing
     * them from the stored Cartesian position if not cached.
     * @param {object} atom
     * @returns {{ x: number, y: number, z: number }}
     */
    getFracSafe(atom) {
        const cached = this.getFrac(atom);
        if (cached) return cached;
        const f = this.lattice.cartToFrac(atom.position.x, atom.position.y, atom.position.z);
        return { x: f.x, y: f.y, z: f.z };
    }

    /**
     * Wrap all atoms into the unit cell [0, 1).
     * Updates both fracCoords and Cartesian positions.
     */
    wrapAtoms() {
        if (!this.lattice) return;
        this.atoms.forEach(atom => {
            const frac = this.getFracSafe(atom);
            frac.x = ((frac.x % 1) + 1) % 1;
            frac.y = ((frac.y % 1) + 1) % 1;
            frac.z = ((frac.z % 1) + 1) % 1;
            const cart = this.lattice.fracToCart(frac.x, frac.y, frac.z);
            atom.position.copy(cart);
        });
    }

    /**
     * Generate a supercell using a general 3×3 integer transformation matrix S.
     *
     * Convention (row form, same as ASE/pymatgen):
     *   new_a = S[0][0]*a + S[0][1]*b + S[0][2]*c
     *   new_b = S[1][0]*a + S[1][1]*b + S[1][2]*c
     *   new_c = S[2][0]*a + S[2][1]*b + S[2][2]*c
     *
     * Fractional coordinate transformation:
     *   f_new = (S^T)^{-1} * f_old
     *
     * The resulting supercell contains |det(S)| × (original atom count) atoms.
     *
     * @param {number[][]} S 3×3 integer matrix  (e.g. [[1,1,0],[-1,1,0],[0,0,1]])
     * @returns {Crystal}
     */
    generateSupercellMatrix(S) {
        if (!this.lattice) throw new Error('Crystal: lattice not set');

        if (S.length !== 3 || S.some(r => !r || r.length !== 3)) {
            throw new Error('Transformation matrix must be 3×3');
        }

        const det = S[0][0] * (S[1][1] * S[2][2] - S[1][2] * S[2][1])
                  - S[0][1] * (S[1][0] * S[2][2] - S[1][2] * S[2][0])
                  + S[0][2] * (S[1][0] * S[2][1] - S[1][1] * S[2][0]);

        if (Math.abs(det) < 0.1) {
            throw new Error(`Transformation matrix is singular (det = ${det.toFixed(4)})`);
        }

        // ── New lattice vectors ───────────────────────────────────────────────
        const { a: va, b: vb, c: vc } = this.lattice.toLatticeVectors();

        const newVa = new THREE.Vector3()
            .addScaledVector(va, S[0][0]).addScaledVector(vb, S[0][1]).addScaledVector(vc, S[0][2]);
        const newVb = new THREE.Vector3()
            .addScaledVector(va, S[1][0]).addScaledVector(vb, S[1][1]).addScaledVector(vc, S[1][2]);
        const newVc = new THREE.Vector3()
            .addScaledVector(va, S[2][0]).addScaledVector(vb, S[2][1]).addScaledVector(vc, S[2][2]);

        // ── Coordinate transform: f_new = (S^T)^{-1} * f_old ────────────────
        // THREE.Matrix3.set() is row-major, so S^T has rows = columns of S:
        const ST = new THREE.Matrix3().set(
            S[0][0], S[1][0], S[2][0],
            S[0][1], S[1][1], S[2][1],
            S[0][2], S[1][2], S[2][2]
        );
        const ST_inv = ST.clone().invert();

        // ── Integer offset range ─────────────────────────────────────────────
        // Safe bound: image of [0,1)^3 under S fits within [-R, R] in each axis.
        const maxAbs = Math.max(...S.flat().map(Math.abs));
        const R = Math.ceil(maxAbs) + 1;

        // ── Build supercell ──────────────────────────────────────────────────
        const scName = S.every((r, i) => r.every((v, j) => (i === j ? v !== 1 : v === 0)))
            ? `${this.name} ${S[0][0]}×${S[1][1]}×${S[2][2]}`
            : `${this.name} (matrix supercell)`;

        const sc = new Crystal(scName);
        sc.setLattice(LatticeParams.fromVectors(newVa, newVb, newVc));
        // After an arbitrary rotation/shear the space group is generally P1
        sc.spaceGroup = 'P 1';

        const EPS = 1e-6;

        this.atoms.forEach(atom => {
            const frac = this.getFracSafe(atom);

            for (let n1 = -R; n1 <= R; n1++) {
                for (let n2 = -R; n2 <= R; n2++) {
                    for (let n3 = -R; n3 <= R; n3++) {
                        // Shift original fractional coord by integer lattice vector
                        const fShifted = new THREE.Vector3(
                            frac.x + n1,
                            frac.y + n2,
                            frac.z + n3
                        );
                        // Transform to new fractional coordinates
                        const fNew = fShifted.clone().applyMatrix3(ST_inv);

                        if (
                            fNew.x >= -EPS && fNew.x < 1 - EPS &&
                            fNew.y >= -EPS && fNew.y < 1 - EPS &&
                            fNew.z >= -EPS && fNew.z < 1 - EPS
                        ) {
                            sc.addAtomFractional(
                                atom.element,
                                ((fNew.x % 1) + 1) % 1,
                                ((fNew.y % 1) + 1) % 1,
                                ((fNew.z % 1) + 1) % 1
                            );
                        }
                    }
                }
            }
        });

        return sc;
    }

    /**
     * Convenience wrapper: repeat na × nb × nc times along a, b, c axes.
     * Delegates to generateSupercellMatrix for consistency.
     * @param {number} na  @param {number} nb  @param {number} nc
     * @returns {Crystal}
     */
    generateSupercell(na, nb, nc) {
        return this.generateSupercellMatrix([
            [na,  0,  0],
            [ 0, nb,  0],
            [ 0,  0, nc]
        ]);
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
