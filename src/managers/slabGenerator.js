import * as THREE from 'three';
import { Crystal, LatticeParams } from '../crystal.js';

/** Greatest common divisor (positive) */
function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) { [a, b] = [b, a % b]; }
    return a || 1;
}

/**
 * Builds surface slab models from a 3D crystal by cutting along an (hkl) plane.
 *
 * Algorithm:
 *  1. Compute the surface normal via the reciprocal lattice (n̂ ∝ h·a* + k·b* + l·c*)
 *  2. Find the two shortest in-plane lattice vectors by searching small integer combos
 *     satisfying h·n1 + k·n2 + l·n3 = 0
 *  3. Build a temporary supercell large enough to contain `layers` atomic planes
 *  4. Project atoms onto n̂, group into discrete layers (within a tolerance)
 *  5. Retain the first `layers` planes; optionally centre the slab in the vacuum
 *  6. Convert to fractional coordinates of the new slab cell, wrap, and deduplicate
 */
export class SlabGenerator {
    /**
     * Generate a surface slab.
     *
     * @param {import('../crystal.js').Crystal} crystal - Bulk crystal
     * @param {number} h  Miller index h
     * @param {number} k  Miller index k
     * @param {number} l  Miller index l
     * @param {number} [layers=4]   Number of atomic layers to include
     * @param {number} [vacuum=10]  Vacuum thickness in Å
     * @param {boolean} [centered=true]  Centre the slab symmetrically in the vacuum
     * @returns {Crystal} Slab structure
     */
    static generate(crystal, h, k, l, layers = 4, vacuum = 10.0, centered = true) {
        if (!crystal.isCrystal || !crystal.lattice) {
            throw new Error('Input is not a crystal structure');
        }
        if (h === 0 && k === 0 && l === 0) {
            throw new Error('Miller indices cannot all be zero');
        }

        // ── Normalise by GCD ────────────────────────────────────────────────
        const g = gcd(gcd(Math.abs(h), Math.abs(k)), Math.abs(l));
        h = Math.round(h / g);
        k = Math.round(k / g);
        l = Math.round(l / g);

        const { a: va, b: vb, c: vc } = crystal.lattice.toLatticeVectors();
        const vol = va.clone().dot(new THREE.Vector3().crossVectors(vb, vc));
        if (Math.abs(vol) < 1e-10) throw new Error('Degenerate unit cell');

        // ── Reciprocal lattice vectors (without 2π factor) ──────────────────
        const ra = new THREE.Vector3().crossVectors(vb, vc).divideScalar(vol);
        const rb = new THREE.Vector3().crossVectors(vc, va).divideScalar(vol);
        const rc = new THREE.Vector3().crossVectors(va, vb).divideScalar(vol);

        // Surface normal in Cartesian space
        const G = new THREE.Vector3()
            .addScaledVector(ra, h)
            .addScaledVector(rb, k)
            .addScaledVector(rc, l);

        const d_hkl = 1.0 / G.length();      // d-spacing (Å)
        const n_hat = G.clone().normalize();  // unit surface normal

        // ── Find two shortest in-plane lattice vectors ──────────────────────
        // Condition: integer combo (i,j,m) lies in (hkl) plane iff i·h+j·k+m·l = 0
        const inPlaneVecs = [];
        const MAX_S = 4;
        for (let i = -MAX_S; i <= MAX_S; i++) {
            for (let j = -MAX_S; j <= MAX_S; j++) {
                for (let m = -MAX_S; m <= MAX_S; m++) {
                    if (i === 0 && j === 0 && m === 0) continue;
                    if (i * h + j * k + m * l !== 0) continue;
                    const v = new THREE.Vector3()
                        .addScaledVector(va, i)
                        .addScaledVector(vb, j)
                        .addScaledVector(vc, m);
                    if (v.length() > 0.01) inPlaneVecs.push(v);
                }
            }
        }
        inPlaneVecs.sort((a, b) => a.length() - b.length());

        let new_a = null, new_b = null;
        for (const v of inPlaneVecs) {
            if (!new_a) { new_a = v.clone(); continue; }
            // Independent in the (hkl) plane iff cross product has component along n̂
            const cross = new THREE.Vector3().crossVectors(new_a, v);
            if (Math.abs(cross.dot(n_hat)) > 1e-6 * new_a.length() * v.length()) {
                new_b = v.clone();
                break;
            }
        }
        if (!new_a || !new_b) {
            throw new Error(`Cannot find in-plane cell vectors for (${h}${k}${l}). Try smaller Miller indices.`);
        }

        // Ensure right-handed orientation: new_a × new_b · n̂ > 0
        if (new THREE.Vector3().crossVectors(new_a, new_b).dot(n_hat) < 0) {
            [new_a, new_b] = [new_b, new_a];
        }

        // ── Build temporary supercell large enough to contain `layers` planes ─
        // Projection of each primitive vector onto n̂ = M_i × d_hkl
        // ⟹ repeats_i = ceil(layers / |M_i|) + extra  (2 if M_i = 0)
        const nRep = (mi) => mi === 0 ? 2 : Math.min(8, Math.ceil(layers / Math.abs(mi)) + 2);
        const Na = nRep(h), Nb = nRep(k), Nc = nRep(l);

        const allAtoms = [];
        crystal.atoms.forEach(atom => {
            let frac = crystal.getFrac(atom);
            if (!frac) {
                const f = crystal.lattice.cartToFrac(
                    atom.position.x, atom.position.y, atom.position.z
                );
                frac = { x: f.x, y: f.y, z: f.z };
            }
            const fx = ((frac.x % 1) + 1) % 1;
            const fy = ((frac.y % 1) + 1) % 1;
            const fz = ((frac.z % 1) + 1) % 1;

            for (let ia = 0; ia < Na; ia++) {
                for (let ib = 0; ib < Nb; ib++) {
                    for (let ic = 0; ic < Nc; ic++) {
                        const cart = crystal.lattice.fracToCart(fx + ia, fy + ib, fz + ic);
                        allAtoms.push({ element: atom.element, pos: cart });
                    }
                }
            }
        });

        // ── Project onto surface normal; group into discrete layers ─────────
        allAtoms.forEach(a => { a.z_proj = a.pos.dot(n_hat); });

        const EPS_layer = Math.max(0.02, d_hkl * 0.04); // tolerance for same layer
        const sortedZ = allAtoms.map(a => a.z_proj).sort((x, y) => x - y);

        const layerZs = [];
        for (const z of sortedZ) {
            if (layerZs.length === 0 || z - layerZs[layerZs.length - 1] > EPS_layer) {
                layerZs.push(z);
            }
        }

        if (layerZs.length < layers) {
            throw new Error(
                `Only ${layerZs.length} atomic layers found, but ${layers} requested. ` +
                `Try reducing layer count or increasing supercell size.`
            );
        }

        const z_min      = layerZs[0];
        const z_max_slab = layerZs[layers - 1];
        const slab_height = z_max_slab - z_min;

        // ── Filter: keep atoms in the slab depth range ──────────────────────
        const slabAtoms = allAtoms.filter(
            a => a.z_proj >= z_min - EPS_layer * 0.5 &&
                 a.z_proj <= z_max_slab + EPS_layer * 0.5
        );

        // Translate so the bottom layer is at z = 0
        slabAtoms.forEach(a => {
            a.pos_shifted = a.pos.clone().addScaledVector(n_hat, -z_min);
        });

        // ── New slab cell vectors ────────────────────────────────────────────
        const total_c_len = slab_height + vacuum;
        const new_c = n_hat.clone().multiplyScalar(total_c_len);

        // Column-major matrix M = [new_a | new_b | new_c]
        const M = new THREE.Matrix3().set(
            new_a.x, new_b.x, new_c.x,
            new_a.y, new_b.y, new_c.y,
            new_a.z, new_b.z, new_c.z
        );
        const M_inv = M.clone().invert();

        // ── Convert to fractional coords in slab cell; wrap & deduplicate ───
        const EPS_frac = 2e-4;
        const candidates = [];

        for (const a of slabAtoms) {
            const frac = a.pos_shifted.clone().applyMatrix3(M_inv);

            // Wrap in-plane coordinates to [0, 1)
            frac.x = ((frac.x % 1) + 1) % 1;
            frac.y = ((frac.y % 1) + 1) % 1;

            // Z must sit within the slab (before vacuum offset)
            if (frac.z < -EPS_frac || frac.z >= 1.0 - EPS_frac) continue;
            frac.z = Math.max(0, frac.z);

            candidates.push({ element: a.element, fx: frac.x, fy: frac.y, fz: frac.z });
        }

        // Deduplicate (same element + fractional position within tolerance)
        const uniqueAtoms = [];
        for (const cand of candidates) {
            let isDup = false;
            for (const ua of uniqueAtoms) {
                if (ua.element !== cand.element) continue;
                let dx = Math.abs(ua.fx - cand.fx); if (dx > 0.5) dx = 1 - dx;
                let dy = Math.abs(ua.fy - cand.fy); if (dy > 0.5) dy = 1 - dy;
                let dz = Math.abs(ua.fz - cand.fz); if (dz > 0.5) dz = 1 - dz;
                if (dx < EPS_frac * 10 && dy < EPS_frac * 10 && dz < EPS_frac * 10) {
                    isDup = true; break;
                }
            }
            if (!isDup) uniqueAtoms.push(cand);
        }

        // ── Centre slab symmetrically in the vacuum ──────────────────────────
        const z_offset = centered ? (vacuum * 0.5) / total_c_len : 0;

        // ── Build the slab Crystal ───────────────────────────────────────────
        const slabName = `${crystal.name} (${h}${k}${l}) ${layers}L`;
        const slab = new Crystal(slabName);
        slab.setLattice(LatticeParams.fromVectors(new_a, new_b, new_c));
        slab.spaceGroup = 'P 1';

        uniqueAtoms.forEach(a => {
            slab.addAtomFractional(a.element, a.fx, a.fy, a.fz + z_offset);
        });

        // Attach metadata for informational purposes
        slab._slabInfo = {
            miller: [h, k, l],
            dSpacing: d_hkl,
            nAtomicLayers: layers,
            vacuum,
            centered,
            nAtoms: uniqueAtoms.length,
        };

        return slab;
    }
}
