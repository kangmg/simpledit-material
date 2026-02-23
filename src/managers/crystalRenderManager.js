import * as THREE from 'three';

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
        const O   = new THREE.Vector3();
        const A   = a.clone();
        const B   = b.clone();
        const C   = c.clone();
        const AB  = A.clone().add(B);
        const AC  = A.clone().add(C);
        const BC  = B.clone().add(C);
        const ABC = A.clone().add(B).add(C);

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
            return;
        }
        this.drawUnitCell(mol);
        if (this.showGhosts) {
            this.drawGhostAtoms(mol, this.editor.renderManager);
        }
    }
}
