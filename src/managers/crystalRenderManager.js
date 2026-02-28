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

        /** @type {THREE.Sprite[]} Miller index labels */
        this.millerLabels = [];
        this.showMillerIndices = false;

        /** @type {THREE.Mesh[]} Miller plane meshes */
        this.millerPlanes = [];
        this.activePlanes = []; // Array of {h, k, l} objects
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
     * Render ghost atoms and bonds based on PBC connectivity.
     * Shows atoms in neighboring cells that can bond with home cell atoms.
     * @param {import('../crystal.js').Crystal} crystal
     * @param {import('./renderManager.js').RenderManager} renderManager
     */
    drawGhostAtoms(crystal, renderManager) {
        this.clearGhostAtoms();
        if (!crystal || !crystal.lattice || !this.showGhosts) return;

        const { a, b, c } = crystal.lattice.toLatticeVectors();
        const drawnGhosts = new Map();
        
        // Get bond threshold from slider
        const thresholdSlider = document.getElementById('bond-threshold');
        const bondThreshold = thresholdSlider ? parseFloat(thresholdSlider.value) : 1.2;

        // Pre-calculate max search radius for optimization
        const maxRadius = Math.max(...crystal.atoms.map(atom => 
            renderManager.getElementRadius(atom.element)
        ));
        const maxSearchDist = maxRadius * 2 * bondThreshold;

        // For each atom in home cell
        crystal.atoms.forEach(homeAtom => {
            const homeRadius = renderManager.getElementRadius(homeAtom.element);
            
            // Check all atoms for potential periodic bonds
            crystal.atoms.forEach(otherAtom => {
                const otherRadius = renderManager.getElementRadius(otherAtom.element);
                const maxBondDist = (homeRadius + otherRadius) * bondThreshold;
                
                // Check all neighboring cells
                for (let ia = -1; ia <= 1; ia++) {
                    for (let ib = -1; ib <= 1; ib++) {
                        for (let ic = -1; ic <= 1; ic++) {
                            if (ia === 0 && ib === 0 && ic === 0) continue;
                            
                            const offset = new THREE.Vector3()
                                .addScaledVector(a, ia)
                                .addScaledVector(b, ib)
                                .addScaledVector(c, ic);
                            
                            const ghostPos = otherAtom.position.clone().add(offset);
                            const dist = homeAtom.position.distanceTo(ghostPos);
                            
                            // Skip if too far (optimization)
                            if (dist > maxSearchDist) continue;
                            
                            // If within bonding distance
                            if (dist < maxBondDist) {
                                const ghostKey = `${otherAtom.id}_${ia}_${ib}_${ic}`;
                                
                                // Draw ghost atom if not already drawn
                                if (!drawnGhosts.has(ghostKey)) {
                                    const color = renderManager.getElementColor(otherAtom.element);
                                    const radius = otherRadius * 0.6;
                                    
                                    const geo = new THREE.SphereGeometry(radius, 8, 8);
                                    const mat = new THREE.MeshPhongMaterial({
                                        color,
                                        transparent: true,
                                        opacity: 0.3,
                                        shininess: 20
                                    });
                                    const mesh = new THREE.Mesh(geo, mat);
                                    mesh.position.copy(ghostPos);
                                    mesh.userData = { type: 'ghostAtom', key: ghostKey };
                                    this.scene.add(mesh);
                                    this.ghostMeshes.push(mesh);
                                    drawnGhosts.set(ghostKey, { mesh, position: ghostPos });
                                }
                                
                                // Draw bond between home atom and ghost
                                const bondGeo = new THREE.BufferGeometry().setFromPoints([
                                    homeAtom.position,
                                    ghostPos
                                ]);
                                const bondMat = new THREE.LineBasicMaterial({
                                    color: 0x666666,
                                    transparent: true,
                                    opacity: 0.3
                                });
                                const bondLine = new THREE.Line(bondGeo, bondMat);
                                bondLine.userData = { type: 'ghostBond' };
                                this.scene.add(bondLine);
                                this.ghostMeshes.push(bondLine);
                            }
                        }
                    }
                }
            });
        });
    }

    clearGhostAtoms() {
        this.ghostMeshes.forEach(mesh => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (mesh.material.map) mesh.material.map.dispose();
                mesh.material.dispose();
            }
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

    // ─── Miller Indices ───────────────────────────────────────────────────────

    /**
     * Draw Miller index labels for major crystal planes
     * @param {import('../crystal.js').Crystal} crystal
     */
    drawMillerIndices(crystal) {
        this.clearMillerIndices();
        if (!crystal || !crystal.lattice || !this.showMillerIndices) return;

        const { a, b, c } = crystal.lattice.toLatticeVectors();
        
        // Calculate reciprocal lattice vectors
        const V = a.dot(b.clone().cross(c));
        if (Math.abs(V) < 1e-10) return;
        
        const aStar = b.clone().cross(c).divideScalar(V);
        const bStar = c.clone().cross(a).divideScalar(V);
        const cStar = a.clone().cross(b).divideScalar(V);

        // Common Miller indices to display
        const indices = [
            { h: 1, k: 0, l: 0, color: '#ff6b6b' },
            { h: 0, k: 1, l: 0, color: '#4ecdc4' },
            { h: 0, k: 0, l: 1, color: '#95e1d3' },
            { h: 1, k: 1, l: 0, color: '#f9ca24' },
            { h: 1, k: 0, l: 1, color: '#f0932b' },
            { h: 0, k: 1, l: 1, color: '#eb4d4b' },
            { h: 1, k: 1, l: 1, color: '#6c5ce7' }
        ];

        indices.forEach(({ h, k, l, color }) => {
            // Calculate plane normal using reciprocal lattice
            const normal = new THREE.Vector3()
                .addScaledVector(aStar, h)
                .addScaledVector(bStar, k)
                .addScaledVector(cStar, l);
            
            if (normal.length() === 0) return;
            normal.normalize();

            // Position label at plane intersection with cell
            const scale = Math.max(a.length(), b.length(), c.length()) * 0.5;
            const position = normal.clone().multiplyScalar(scale);

            const sprite = this.createTextSprite(`(${h}${k}${l})`, color);
            sprite.position.copy(position);
            sprite.scale.set(2, 1, 1);
            this.scene.add(sprite);
            this.millerLabels.push(sprite);
        });
    }

    createTextSprite(text, color = '#ffffff') {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;

        context.fillStyle = color;
        context.font = 'Bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 128, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        // Keep canvas reference so clearMillerIndices() can release it fully.
        sprite.userData.canvas = canvas;
        return sprite;
    }

    clearMillerIndices() {
        this.millerLabels.forEach(sprite => {
            if (sprite.material.map) sprite.material.map.dispose();
            if (sprite.material) sprite.material.dispose();
            this.scene.remove(sprite);
            // Release the off-screen canvas held by this sprite.
            sprite.userData.canvas = null;
        });
        this.millerLabels = [];
    }

    setMillerIndices(visible) {
        this.showMillerIndices = visible;
        if (!visible) this.clearMillerIndices();
    }

    // ─── Miller Planes ────────────────────────────────────────────────────────

    /**
     * Draw Miller plane as semi-transparent mesh
     * @param {import('../crystal.js').Crystal} crystal
     * @param {number} h - Miller index h
     * @param {number} k - Miller index k
     * @param {number} l - Miller index l
     * @param {number} color - Plane color
     */
    drawMillerPlane(crystal, h, k, l, color = 0x4ecdc4) {
        if (!crystal || !crystal.lattice) return;

        const { a, b, c } = crystal.lattice.toLatticeVectors();
        
        // Calculate reciprocal lattice vectors
        const V = a.dot(b.clone().cross(c)); // Unit cell volume
        if (Math.abs(V) < 1e-10) return; // Degenerate cell
        
        const aStar = b.clone().cross(c).divideScalar(V);
        const bStar = c.clone().cross(a).divideScalar(V);
        const cStar = a.clone().cross(b).divideScalar(V);
        
        // Calculate plane normal in reciprocal space
        const normal = new THREE.Vector3()
            .addScaledVector(aStar, h)
            .addScaledVector(bStar, k)
            .addScaledVector(cStar, l);
        
        if (normal.length() === 0) return;
        normal.normalize();

        // Find plane size based on cell dimensions
        const cellSize = Math.max(a.length(), b.length(), c.length()) * 2;
        const planeGeo = new THREE.PlaneGeometry(cellSize, cellSize);
        const planeMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const plane = new THREE.Mesh(planeGeo, planeMat);
        
        // Position plane at origin and orient according to normal
        plane.lookAt(normal);
        plane.userData = { type: 'millerPlane', hkl: { h, k, l } };
        
        this.scene.add(plane);
        this.millerPlanes.push(plane);
    }

    clearMillerPlanes() {
        this.millerPlanes.forEach(mesh => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            this.scene.remove(mesh);
        });
        this.millerPlanes = [];
    }

    addMillerPlane(h, k, l) {
        const mol = this.editor.molecule;
        if (!mol || !mol.isCrystal) return;

        // Check if already exists
        const exists = this.activePlanes.some(p => p.h === h && p.k === k && p.l === l);
        if (exists) return;

        // Push to activePlanes only after confirming we have a valid crystal,
        // so the list never contains planes that were never drawn.
        const colors = [0x4ecdc4, 0xf9ca24, 0xeb4d4b, 0x6c5ce7, 0xf0932b, 0x95e1d3];
        const color = colors[(this.activePlanes.length) % colors.length];
        this.activePlanes.push({ h, k, l });
        this.drawMillerPlane(mol, h, k, l, color);
    }

    removeMillerPlane(h, k, l) {
        this.activePlanes = this.activePlanes.filter(p => !(p.h === h && p.k === k && p.l === l));
        
        // Redraw all planes
        this.clearMillerPlanes();
        this.activePlanes.forEach((p, i) => {
            const colors = [0x4ecdc4, 0xf9ca24, 0xeb4d4b, 0x6c5ce7, 0xf0932b, 0x95e1d3];
            const color = colors[i % colors.length];
            this.drawMillerPlane(this.editor.molecule, p.h, p.k, p.l, color);
        });
    }

    clearAllMillerPlanes() {
        this.clearMillerPlanes();
        this.activePlanes = [];
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
            this.clearMillerIndices();
            this.clearMillerPlanes();
            return;
        }
        this.drawUnitCell(mol);
        if (this.showGhosts) {
            this.drawGhostAtoms(mol, this.editor.renderManager);
        }
        if (this.showPolyhedra) {
            this.drawPolyhedra(mol, this.editor.renderManager);
        }
        if (this.showMillerIndices) {
            this.drawMillerIndices(mol);
        }
        // Redraw active Miller planes
        this.activePlanes.forEach((p, i) => {
            const colors = [0x4ecdc4, 0xf9ca24, 0xeb4d4b, 0x6c5ce7, 0xf0932b, 0x95e1d3];
            const color = colors[i % colors.length];
            this.drawMillerPlane(mol, p.h, p.k, p.l, color);
        });
    }
}
