import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

/**
 * Manages crystal-specific 3D rendering:
 *  - Unit cell wireframe (the parallelepiped defined by the lattice vectors)
 *  - Ghost (image) atoms in adjacent unit cells (optional)
 *
 * This manager works alongside the standard RenderManager.
 * Call drawUnitCell(crystal) after rebuildScene() to overlay the cell box.
 */
export class CrystalRenderManager {
    constructor(editor) {
        this.editor = editor;
        this.scene = editor.renderer.scene;

        /** @type {THREE.LineSegments|null} */
        this.unitCellMesh = null;
        this.showUnitCell = true;

        /** @type {THREE.Object3D[]} Ghost (periodic image) atom meshes */
        this.ghostMeshes = [];
        this.showGhosts = false;

        this._cellColor = 0x1a1a2e;   // dark navy for the box edges
        this._aColor    = 0xcc0000;    // red  for a-axis highlight
        this._bColor    = 0x007700;    // green for b-axis highlight
        this._cColor    = 0x0000cc;    // blue  for c-axis highlight

        /** @type {THREE.Mesh[]} Polyhedral meshes */
        this.polyhedralMeshes = [];
        this.showPolyhedra = false;
        /** Elements that are polyhedra centres (empty = all with CN ≥ 3) */
        this.polyhedralElements = [];
    }

    // ─── Unit cell wireframe ──────────────────────────────────────────────────

    /**
     * Draw (or redraw) the unit cell box for the given crystal.
     * The parallelepiped has its origin at (0, 0, 0).
     * @param {import('../crystal.js').Crystal} crystal
     */
    drawUnitCell(crystal) {
        this.clearUnitCell();
        if (!crystal || !crystal.lattice || !this.showUnitCell) return;

        const { a, b, c } = crystal.lattice.toLatticeVectors();

        // Back-compute the Cartesian position of the fractional origin (0,0,0).
        // When operations like 'center' shift atom.position without updating
        // fracCoords, the lattice box must be offset by the same amount.
        const O = new THREE.Vector3();
        for (const atom of crystal.atoms) {
            const frac = crystal.getFrac ? crystal.getFrac(atom) : null;
            if (frac) {
                const expected = crystal.lattice.fracToCart(frac.x, frac.y, frac.z);
                O.copy(atom.position).sub(expected);
                break;
            }
        }

        const A   = O.clone().add(a);
        const B   = O.clone().add(b);
        const C   = O.clone().add(c);
        const AB  = O.clone().add(a).add(b);
        const AC  = O.clone().add(a).add(c);
        const BC  = O.clone().add(b).add(c);
        const ABC = O.clone().add(a).add(b).add(c);

        // 12 edges of the parallelepiped
        // Axis edges coloured distinctly; face-diagonal edges in cell colour
        const edges = [
            // a-axis edges (red)
            [O, A, this._aColor],
            [B, AB, this._aColor],
            [C, AC, this._aColor],
            [BC, ABC, this._aColor],
            // b-axis edges (green)
            [O, B, this._bColor],
            [A, AB, this._bColor],
            [C, BC, this._bColor],
            [AC, ABC, this._bColor],
            // c-axis edges (blue)
            [O, C, this._cColor],
            [A, AC, this._cColor],
            [B, BC, this._cColor],
            [AB, ABC, this._cColor],
        ];

        const group = new THREE.Group();
        group.userData = { type: 'unitCell' };

        edges.forEach(([p1, p2, color]) => {
            const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
            const mat = new THREE.LineBasicMaterial({ color });
            group.add(new THREE.Line(geo, mat));
        });

        this.unitCellMesh = group;
        this.scene.add(group);
    }

    clearUnitCell() {
        if (this.unitCellMesh) {
            this.unitCellMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.scene.remove(this.unitCellMesh);
            this.unitCellMesh = null;
        }
    }

    setUnitCellVisible(visible) {
        this.showUnitCell = visible;
        if (this.unitCellMesh) this.unitCellMesh.visible = visible;
    }

    // ─── Ghost (periodic image) atoms ────────────────────────────────────────

    /**
     * Render semi-transparent ghost atoms in the first shell of neighbouring
     * cells (±1 in each lattice direction) for the given crystal.
     * @param {import('../crystal.js').Crystal} crystal
     * @param {import('./renderManager.js').RenderManager} renderManager
     */
    drawGhostAtoms(crystal, renderManager) {
        this.clearGhostAtoms();
        if (!crystal || !crystal.lattice || !this.showGhosts) return;

        const { a, b, c } = crystal.lattice.toLatticeVectors();

        for (let ia = -1; ia <= 1; ia++) {
            for (let ib = -1; ib <= 1; ib++) {
                for (let ic = -1; ic <= 1; ic++) {
                    if (ia === 0 && ib === 0 && ic === 0) continue; // skip home cell
                    const offset = new THREE.Vector3()
                        .addScaledVector(a, ia)
                        .addScaledVector(b, ib)
                        .addScaledVector(c, ic);

                    crystal.atoms.forEach(atom => {
                        const ghostPos = atom.position.clone().add(offset);
                        const color = renderManager.getElementColor(atom.element);
                        const radius = renderManager.getElementRadius(atom.element) * 0.6;

                        const geo = new THREE.SphereGeometry(radius, 8, 8);
                        const mat = new THREE.MeshPhongMaterial({
                            color,
                            transparent: true,
                            opacity: 0.25,
                            shininess: 20
                        });
                        const mesh = new THREE.Mesh(geo, mat);
                        mesh.position.copy(ghostPos);
                        mesh.userData = { type: 'ghostAtom' };
                        this.scene.add(mesh);
                        this.ghostMeshes.push(mesh);
                    });
                }
            }
        }
    }

    clearGhostAtoms() {
        this.ghostMeshes.forEach(mesh => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            this.scene.remove(mesh);
        });
        this.ghostMeshes = [];
    }

    setGhostAtomsVisible(visible) {
        this.showGhosts = visible;
        if (!visible) {
            this.clearGhostAtoms();
        }
    }

    // ─── Coordination polyhedra ───────────────────────────────────────────────

    /**
     * Render semi-transparent coordination polyhedra.
     * Each atom whose element is in `polyhedralElements` (or all atoms with CN ≥ 3
     * if the list is empty) is used as a polyhedron centre; its bonded neighbours
     * form the vertices.
     *
     * For crystal structures, neighbour positions are obtained via the minimum-image
     * convention so that face-sharing polyhedra across PBC look correct.
     *
     * @param {import('../crystal.js').Crystal|import('../molecule.js').Molecule} mol
     * @param {import('./renderManager.js').RenderManager} renderManager
     */
    drawPolyhedra(mol, renderManager) {
        this.clearPolyhedra();
        if (!this.showPolyhedra || !mol) return;

        const filterEls = this.polyhedralElements.length > 0
            ? new Set(this.polyhedralElements)
            : null;

        mol.atoms.forEach(atom => {
            if (filterEls && !filterEls.has(atom.element)) return;
            if (atom.bonds.length < 3) return; // need at least 4 points for a solid

            // Collect neighbour positions (using minimum-image for PBC)
            const pts = [];
            atom.bonds.forEach(bond => {
                const nb = bond.atom1 === atom ? bond.atom2 : bond.atom1;
                let pos = nb.position.clone();
                if (mol.isCrystal && mol.lattice) {
                    const disp = pos.clone().sub(atom.position);
                    const miDisp = mol.lattice.minimumImage(disp.x, disp.y, disp.z);
                    pos = atom.position.clone().add(miDisp);
                }
                pts.push(pos);
            });

            if (pts.length < 3) return;

            // Deduplicate coincident points (ConvexGeometry throws on them)
            const uniquePts = [pts[0]];
            for (let i = 1; i < pts.length; i++) {
                if (uniquePts.every(p => p.distanceTo(pts[i]) > 0.05)) {
                    uniquePts.push(pts[i]);
                }
            }
            if (uniquePts.length < 3) return;

            try {
                const geo = new ConvexGeometry(uniquePts);
                const color = renderManager.getElementColor(atom.element);
                const mat = new THREE.MeshPhongMaterial({
                    color,
                    transparent: true,
                    opacity: 0.32,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    shininess: 40,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.userData = { type: 'polyhedron' };
                this.scene.add(mesh);
                this.polyhedralMeshes.push(mesh);
            } catch (e) {
                // Degenerate point set (all coplanar, etc.) – silently skip
            }
        });
    }

    clearPolyhedra() {
        this.polyhedralMeshes.forEach(m => {
            if (m.geometry) m.geometry.dispose();
            if (m.material) m.material.dispose();
            this.scene.remove(m);
        });
        this.polyhedralMeshes = [];
    }

    /**
     * Enable / disable polyhedral rendering.
     * @param {boolean} visible
     * @param {string[]} [elements] Optional element filter (e.g. ['Fe', 'Ti'])
     */
    setPolyhedra(visible, elements) {
        this.showPolyhedra = visible;
        if (elements !== undefined) this.polyhedralElements = elements;
        if (!visible) this.clearPolyhedra();
    }

    // ─── Full refresh ─────────────────────────────────────────────────────────

    /**
     * Redraw all crystal-specific overlays for the current active molecule.
     * Should be called after rebuildScene().
     */
    refresh() {
        const mol = this.editor.molecule;
        if (!mol || !mol.isCrystal) {
            this.clearUnitCell();
            this.clearGhostAtoms();
            this.clearPolyhedra();
            return;
        }
        this.drawUnitCell(mol);
        if (this.showGhosts) {
            this.drawGhostAtoms(mol, this.editor.renderManager);
        }
        if (this.showPolyhedra) {
            this.drawPolyhedra(mol, this.editor.renderManager);
        }
    }
}
