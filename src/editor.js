import * as THREE from 'three';
import { Renderer } from './renderer.js';
import { MoleculeManager } from './moleculeManager.js';
import { GeometryEngine } from './geometryEngine.js';
import { AxisHelper } from './axisHelper.js';
import { ELEMENTS, DEFAULT_ELEMENT } from './constants.js';
import { Console } from './console.js';
import { Interaction } from './interaction.js';
import { oclManager } from './managers/oclManager.js';

// Manager classes
import { EditorState } from './editorState.js';
import { SelectionManager } from './managers/selectionManager.js';
import { UIManager } from './managers/uiManager.js';
import { FileIOManager } from './managers/fileIOManager.js';
import { RenderManager } from './managers/renderManager.js';
import { GeometryController } from './managers/geometryController.js';

export class Editor {
    constructor() {
        this.canvas = document.getElementById('editor-canvas');
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'editor-canvas';
            document.getElementById('app').appendChild(this.canvas);
        }
        this.renderer = new Renderer(this.canvas);

        // Initialize centralized state
        this.state = new EditorState();

        // IMPORTANT: Initialize Manager classes BEFORE MoleculeManager
        // because MoleculeManager.createMolecule() calls updateAllLabels()
        this.selectionManager = new SelectionManager(this);
        this.uiManager = new UIManager(this);
        this.fileIOManager = new FileIOManager(this);
        this.renderManager = new RenderManager(this);
        this.geometryController = new GeometryController(this);

        // Now safe to initialize MoleculeManager (will call updateAllLabels)
        this.moleculeManager = new MoleculeManager(this);

        this.interaction = new Interaction(this.renderer, this.canvas);

        // Legacy properties (will be migrated gradually)
        this.selectedElement = 'C';
        this.selectedGroup = null;  // For functional groups: { key, smiles, name }
        this.manipulationMode = 'translate'; // For move mode: translate or rotate
        this.editMode = 'manual'; // For edit mode: 'manual' or 'smart'

        // Undo/Redo History
        this.history = [];
        this.historyIndex = -1;
        this.saveState(); // Initialize with empty state

        // Local Mode
        this.isLocalMode = false;
        this.initialArgs = [];

        // Flags to track if we're currently adjusting geometry (for undo/redo)
        this.lengthAdjusting = false;
        this.angleAdjusting = false;
        this.dihedralAdjusting = false;
        this.maxHistory = 50;

        this.ghostBond = null;
        this.dragStartAtom = null;

        this.selectionBox = null;
        this.selectionStart = null;
        this.lassoPath = []; // For lasso selection

        this.isManipulating = false;
        this.initialPositions = null;

        this.bindEvents();
        this.setupInteraction();

        // Initialize label container
        this.labelContainer = document.createElement('div');
        this.labelContainer.id = 'label-container';
        this.labelContainer.style.position = 'absolute';
        this.labelContainer.style.top = '0';
        this.labelContainer.style.left = '0';
        this.labelContainer.style.width = '100%';
        this.labelContainer.style.height = '100%';
        this.labelContainer.style.pointerEvents = 'none';
        this.labelContainer.style.overflow = 'hidden';
        this.labelContainer.style.zIndex = '5'; // Ensure below UI (Sidebar is 10)
        document.body.appendChild(this.labelContainer);

        // Initialize console
        this.console = new Console(this);

        this.axisHelper = new AxisHelper(this);

        // Setup beforeunload handler for data loss prevention
        this.setupBeforeUnload();

        // Start animation loop
        this.animate = this.animate.bind(this);
        this.animate();
    }

    // Compatibility layer: proxy properties to state
    // This allows gradual migration from this.mode to this.state.mode
    get mode() {
        return this.state.mode;
    }
    set mode(value) {
        this.state.setMode(value);
    }

    get labelMode() {
        return this.state.ui.labelMode;
    }
    set labelMode(value) {
        this.state.setLabelMode(value);
    }

    get selectionOrder() {
        return this.state.selection.order;
    }
    set selectionOrder(value) {
        this.state.selection.order = value;
    }

    get colorScheme() {
        return this.state.ui.colorScheme;
    }
    set colorScheme(value) {
        this.state.setColorScheme(value);
    }

    get selectionMode() {
        return this.selectionManager.selectionMode;
    }
    set selectionMode(value) {
        this.selectionManager.selectionMode = value;
    }

    animate() {
        requestAnimationFrame(this.animate);

        this.renderer.controls.update(); // Update controls
        this.renderer.render(); // Renders main scene (including axes)

        // AxisHelper is disabled, using Renderer's built-in axis instead
        /*
        if (this.axisHelper) {
            this.axisHelper.render(this.renderer.renderer);
        }
        */

        // Update label positions if visible
        if (this.labelMode !== 'none') {
            this.updateLabelPositions();
        }
    }

    init() {
        console.log('Editor initialized');
    }

    get molecule() {
        return this.moleculeManager ? (this.moleculeManager.getActive()?.molecule || null) : null;
    }

    bindEvents() {
        // Delegate UI events to UIManager
        this.uiManager.bindToolbarEvents();

        // Delegate Geometry events to GeometryController
        this.geometryController.bindGeometrySliders();

        // Bind canvas interaction events
        this.setupInteraction();

        // Keyboard Shortcuts
        window.addEventListener('keydown', (e) => {
            // Ignore shortcuts if modal is open or typing in input
            if (document.getElementById('coord-modal').style.display === 'block') return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                this.redo();
            }

            // Only handle these keys if not in modal
            if (document.getElementById('coord-modal').style.display === 'block') return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key.toLowerCase() === 't') {
                this.setMode('move');
                this.manipulationMode = 'translate';
                this.updateManipulationStatus();
            } else if (e.key.toLowerCase() === 'r') {
                if (this.mode === 'select') {
                    // In select mode, 'r' switches to rectangle selection
                    this.selectionMode = 'rectangle';
                    this.updateSelectionStatus();
                } else {
                    // In other modes, 'r' switches to move rotate mode
                    this.setMode('move');
                    this.manipulationMode = 'rotate';
                    this.updateManipulationStatus();
                }
            } else if (e.key.toLowerCase() === 'l') {
                if (this.mode === 'select') {
                    // In select mode, 'l' switches to lasso selection
                    this.selectionMode = 'lasso';
                    this.updateSelectionStatus();
                }
            } else if (e.key.toLowerCase() === 's') {
                // Toggle to symbol mode
                this.labelMode = 'symbol';
                document.getElementById('btn-toggle-labels').innerText = 'Labels: Symbol';
                this.updateAllLabels();
            } else if (e.key.toLowerCase() === 'n') {
                // Toggle to number mode
                this.labelMode = 'number';
                document.getElementById('btn-toggle-labels').innerText = 'Labels: Number';
                this.updateAllLabels();
            } else if (e.key.toLowerCase() === 'a') {
                // Toggle to both mode
                this.labelMode = 'both';
                document.getElementById('btn-toggle-labels').innerText = 'Labels: Both';
                this.updateAllLabels();
            } else if (e.key.toLowerCase() === 'o') {
                this.setMode('move');
                this.manipulationMode = 'orbit';
                this.updateManipulationStatus();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelected();
            }
            if (e.key === 'Escape') {
                this.setMode('select');
                this.clearSelection();
            }
        });

        // Molecule Management UI
        const btnNew = document.getElementById('btn-new-molecule');
        if (btnNew) {
            btnNew.onclick = () => {
                this.moleculeManager.createMolecule();
            };
        }

        const btnDelete = document.getElementById('btn-delete-molecule');
        if (btnDelete) {
            btnDelete.onclick = () => {
                if (confirm('Are you sure you want to delete the current molecule?')) {
                    const result = this.moleculeManager.removeMolecule(this.moleculeManager.activeMoleculeIndex);
                    if (result.error) alert(result.error);
                }
            };
        }
    }

    setMode(mode) {
        this.mode = mode;
        document.querySelectorAll('.tool-btn, .icon-btn').forEach(btn => btn.classList.remove('active'));
        const btnMap = {
            'edit': 'btn-edit',
            'select': 'btn-select',
            'move': 'btn-move'
        };
        document.getElementById(btnMap[mode]).classList.add('active');

        if (mode === 'move') {
            if (!this.manipulationMode) this.manipulationMode = 'translate';
            this.updateManipulationStatus();
        } else {
            this.clearManipulationStatus();
        }

        if (mode === 'select') {
            this.updateSelectionStatus();
        } else {
            this.clearSelectionStatus();
        }
    }

    updateManipulationStatus() {
        const btn = document.getElementById('btn-move');
        const sub = btn ? btn.querySelector('.btn-sublabel') : null;

        // Update sublabel
        if (sub) {
            sub.style.display = 'block';
            if (this.manipulationMode === 'translate') {
                sub.innerText = 'Translate';
                sub.style.color = '#4a90e2';
            } else if (this.manipulationMode === 'rotate' || this.manipulationMode === 'trackball') {
                sub.innerText = 'Trackball';
                sub.style.color = '#e24a90';
            } else if (this.manipulationMode === 'orbit') {
                sub.innerText = 'Orbit';
                sub.style.color = '#90e24a';
            }
        }

        // Update submode buttons active state
        const btnTranslate = document.getElementById('btn-move-translate');
        const btnOrbit = document.getElementById('btn-move-orbit');
        const btnTrackball = document.getElementById('btn-move-trackball');

        if (btnTranslate) btnTranslate.classList.toggle('active', this.manipulationMode === 'translate');
        if (btnOrbit) btnOrbit.classList.toggle('active', this.manipulationMode === 'orbit');
        if (btnTrackball) btnTrackball.classList.toggle('active', this.manipulationMode === 'rotate' || this.manipulationMode === 'trackball');
    }

    clearManipulationStatus() {
        const btn = document.getElementById('btn-move');
        const sub = btn.querySelector('.btn-sublabel');

        if (sub) {
            sub.style.display = 'none';
        } else {
            btn.innerText = 'Move/Rotate';
            btn.style.backgroundColor = '';
        }
    }

    updateSelectionStatus() {
        this.selectionManager.updateSelectionStatus();
    }

    clearSelectionStatus() {
        this.selectionManager.clearSelectionStatus();
    }



    setupInteraction() {
        this.interaction.callbacks.onClick = (e, raycaster) => this.handleClick(e, raycaster);
        this.interaction.callbacks.onRightClick = (e, raycaster) => this.handleRightClick(e, raycaster);
        this.interaction.callbacks.onDragStart = (e, raycaster) => this.handleDragStart(e, raycaster);
        this.interaction.callbacks.onDrag = (e, raycaster) => this.handleDrag(e, raycaster);
        this.interaction.callbacks.onDragEnd = (e, raycaster) => this.handleDragEnd(e, raycaster);
    }

    cleanupDrag() {
        this.renderer.controls.enabled = true;

        if (this.ghostBond) {
            this.renderer.scene.remove(this.ghostBond);
            this.ghostBond = null;
        }
        this.dragStartAtom = null;

        this.selectionManager.removeSelectionBox();
        this.selectionManager.selectionStart = null;
        this.selectionManager.lassoPath = [];

        this.isManipulating = false;
        this.initialPositions = null;
    }

    async handleClick(event, raycaster) {
        this.cleanupDrag(); // Ensure any drag state is cleared (e.g. selection box from mousedown)

        // Also clear manipulation state from move mode
        if (this.initialPositions) {
            this.initialPositions = null;
            this.isManipulating = false;
            this.manipulationStartMouse = null;
            this.renderer.controls.enabled = true;
        }

        if (this.mode === 'edit') {
            // Check for atom intersection first
            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom');

            if (atomMesh) {
                const atom = atomMesh.object.userData.atom;

                // Smart mode: Add atom at optimal position
                if (this.editMode === 'smart') {
                    this.saveState();
                    await this.addAtomSmart(atom);
                    return;
                }

                // Manual mode: Substitute element if different
                if (this.selectedElement && atom.element !== this.selectedElement) {
                    this.saveState();
                    atom.element = this.selectedElement;
                    this.rebuildScene();
                    return;
                }
                return;
            }

            // In edit mode, clicking empty space adds an atom (only in Manual mode)
            // Create a plane perpendicular to the camera at an appropriate depth
            const normal = new THREE.Vector3();
            const camera = this.renderer.activeCamera || this.renderer.camera;
            camera.getWorldDirection(normal);

            // Determine the plane position based on existing atoms or camera distance
            let planePoint = new THREE.Vector3(0, 0, 0);

            if (this.molecule.atoms.length > 0) {
                // Calculate centroid of existing atoms
                const centroid = new THREE.Vector3();
                this.molecule.atoms.forEach(atom => {
                    centroid.add(atom.position);
                });
                centroid.divideScalar(this.molecule.atoms.length);
                planePoint = centroid;
            } else {
                // No atoms yet - place at a reasonable distance from camera
                const distance = camera.position.length() * 0.5; // Halfway to camera
                // Normal points INTO the scene (away from camera). So we add normal * distance.
                planePoint = camera.position.clone().add(normal.clone().multiplyScalar(distance));
            }

            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, planePoint);

            const target = new THREE.Vector3();
            const intersection = raycaster.ray.intersectPlane(plane, target);

            console.log('Atom Placement:', {
                intersection: intersection,
                target: target,
                planePoint: planePoint,
                x: target.x,
                y: target.y,
                z: target.z
            });

            if (intersection) {
                this.addAtomToScene(this.selectedElement, target);
            }
        } else if (this.mode === 'select') {
            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom');

            if (atomMesh) {
                const atom = atomMesh.object.userData.atom;
                this.toggleSelection(atom, event.ctrlKey || event.metaKey || event.shiftKey);
            } else {
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                    this.clearSelection();
                }
            }
        }
    }

    toggleSelection(atom, multiSelect) {
        this.selectionManager.toggleSelection(atom, multiSelect);
        this.updateSelectionInfo();
    }

    clearSelection() {
        this.selectionManager.clearSelection();
        this.updateSelectionInfo();
        this.updateBondVisuals();
    }

    updateAtomVisuals(atom) {
        this.renderManager.updateAtomVisuals(atom);
        // Update bond visuals if both atoms are selected
        this.updateBondVisuals();
    }

    updateBondVisuals() {
        this.renderManager.updateBondVisuals();
    }

    updateSliderLabel(id, value) {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT') {
                el.value = value;
            } else {
                el.innerText = value;
            }
        }
    }

    updateSelectionInfo() {
        const count = this.selectionOrder.length;
        document.getElementById('selection-info').innerText = `${count} atoms selected`;

        const geoControls = document.getElementById('geometry-controls');
        const lengthControl = document.getElementById('length-control');
        const angleControl = document.getElementById('angle-control');
        const dihedralControl = document.getElementById('dihedral-control');
        const measurementInfo = document.getElementById('measurement-info');

        geoControls.style.display = count >= 2 ? 'block' : 'none';
        lengthControl.style.display = count === 2 ? 'block' : 'none';
        angleControl.style.display = count === 3 ? 'block' : 'none';
        dihedralControl.style.display = count === 4 ? 'block' : 'none';

        // Update measurement info display
        if (count === 2) {
            const a1 = this.selectionOrder[0];
            const a2 = this.selectionOrder[1];
            const dist = a1.position.distanceTo(a2.position);
            const val = dist.toFixed(3);
            document.getElementById('input-length').value = val;
            this.updateSliderLabel('val-length', val);

            // Display in top-left corner
            const idx1 = this.molecule.atoms.indexOf(a1);
            const idx2 = this.molecule.atoms.indexOf(a2);
            measurementInfo.innerHTML = `${a1.element} (${idx1}) - ${a2.element} (${idx2}): ${dist.toFixed(2)} Å`;
            measurementInfo.style.display = 'block';
        } else if (count === 3) {
            const a1 = this.selectionOrder[0];
            const a2 = this.selectionOrder[1];
            const a3 = this.selectionOrder[2];
            const v1 = a1.position.clone().sub(a2.position);
            const v2 = a3.position.clone().sub(a2.position);
            const angle = v1.angleTo(v2) * (180 / Math.PI);
            const val = angle.toFixed(1);
            document.getElementById('input-angle').value = val;
            this.updateSliderLabel('val-angle', val);

            // Display in top-left corner
            const idx1 = this.molecule.atoms.indexOf(a1);
            const idx2 = this.molecule.atoms.indexOf(a2);
            const idx3 = this.molecule.atoms.indexOf(a3);
            measurementInfo.innerHTML = `${a1.element} (${idx1}) - ${a2.element} (${idx2}) - ${a3.element} (${idx3}): ${angle.toFixed(1)}°`;
            measurementInfo.style.display = 'block';
        } else if (count === 4) {
            // Calculate current dihedral
            const a1 = this.selectionOrder[0];
            const a2 = this.selectionOrder[1];
            const a3 = this.selectionOrder[2];
            const a4 = this.selectionOrder[3];

            const axis = a3.position.clone().sub(a2.position).normalize();
            const v1 = a1.position.clone().sub(a2.position);
            const v2 = a4.position.clone().sub(a3.position);
            const p1 = v1.clone().sub(axis.clone().multiplyScalar(v1.dot(axis)));
            const p2 = v2.clone().sub(axis.clone().multiplyScalar(v2.dot(axis)));

            // Signed angle calculation
            const angleRad = Math.atan2(
                p1.clone().cross(p2).dot(axis),
                p1.dot(p2)
            );
            const angleDeg = angleRad * (180 / Math.PI);

            const val = angleDeg.toFixed(1);
            document.getElementById('input-dihedral').value = val;
            this.updateSliderLabel('val-dihedral', val);

            // Display in top-left corner
            const idx1 = this.molecule.atoms.indexOf(a1);
            const idx2 = this.molecule.atoms.indexOf(a2);
            const idx3 = this.molecule.atoms.indexOf(a3);
            const idx4 = this.molecule.atoms.indexOf(a4);
            measurementInfo.innerHTML = `${a1.element} (${idx1}) - ${a2.element} (${idx2}) - ${a3.element} (${idx3}) - ${a4.element} (${idx4}): ${angleDeg.toFixed(1)}°`;
            measurementInfo.style.display = 'block';
        } else {
            measurementInfo.style.display = 'none';
        }
    }



    setBondLength() {
        const targetDist = parseFloat(document.getElementById('input-length').value);
        if (isNaN(targetDist)) return { error: 'Invalid distance value' };
        return this.geometryController.setBondLength(targetDist);
    }

    setBondAngle() {
        const targetAngle = parseFloat(document.getElementById('input-angle').value);
        if (isNaN(targetAngle)) return { error: 'Invalid angle value' };
        return this.geometryController.setAngle(targetAngle);
    }

    setDihedralAngle() {
        const targetAngle = parseFloat(document.getElementById('input-dihedral').value);
        if (isNaN(targetAngle)) return { error: 'Invalid dihedral value' };
        return this.geometryController.setDihedral(targetAngle);
    }

    handleRightClick(event, raycaster) {
        // In edit mode, right-click deletes atoms
        if (this.mode === 'edit') {
            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom');

            if (atomMesh) {
                const atom = atomMesh.object.userData.atom;
                this.saveState();
                this.molecule.removeAtom(atom);
                this.rebuildScene();
            }
        }
    }

    getTrackballVector(x, y) {
        const p = new THREE.Vector3(
            (x / window.innerWidth) * 2 - 1,
            -(y / window.innerHeight) * 2 + 1,
            0
        );
        if (p.lengthSq() > 1) {
            p.normalize();
        } else {
            p.z = Math.sqrt(1 - p.lengthSq());
        }
        return p;
    }

    handleDragStart(event, raycaster) {
        // Return true to preventDefault, false to allow OrbitControls

        if (this.mode === 'edit') {
            // In edit mode, dragging from an atom creates a bond
            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom');

            if (atomMesh) {
                // Dragging from atom - prevent OrbitControls
                // Disable rotation and panning in TrackballControls
                if (this.renderer.trackballControls) {
                    this.renderer.trackballControls.noRotate = true;
                    this.renderer.trackballControls.noPan = true;
                }

                this.dragStartAtom = atomMesh.object.userData.atom;
                this.ghostBond = this.createGhostBond(this.dragStartAtom.position);
                return true; // Prevent default
            } else {
                // Dragging empty space - allow rotation
                if (this.renderer.trackballControls) {
                    this.renderer.trackballControls.noRotate = false;
                    this.renderer.trackballControls.noPan = false;
                }
                return false; // Allow default (OrbitControls)
            }
        } else if (this.mode === 'select') {
            // If clicking on an atom, allow OrbitControls (selection handled in Click)
            // If dragging empty space, prevent OrbitControls for Lasso
            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom');

            if (!atomMesh) {
                // Start selection (rectangle or lasso) - prevent OrbitControls
                if (this.renderer.trackballControls) {
                    this.renderer.trackballControls.noRotate = true;
                    this.renderer.trackballControls.noPan = true;
                }

                this.selectionManager.startSelection(event.clientX, event.clientY);
                return true; // Prevent default
            } else {
                // Clicking on atom - allow OrbitControls
                if (this.renderer.trackballControls) {
                    this.renderer.trackballControls.noRotate = false;
                    this.renderer.trackballControls.noPan = false;
                }
                return false; // Allow default
            }
        } else if (this.mode === 'move') {
            const selectedAtoms = this.molecule.atoms.filter(a => a.selected);
            console.log('Move start. Selected:', selectedAtoms.length);

            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom');

            if (selectedAtoms.length > 0 && atomMesh && atomMesh.object.userData.atom.selected) {
                // Prevent OrbitControls from interfering with atom manipulation
                if (this.renderer.trackballControls) {
                    this.renderer.trackballControls.noRotate = true;
                    this.renderer.trackballControls.noPan = true;
                }

                // this.saveState(); // Removed: Save after move completes
                // Don't set isManipulating yet - wait for actual drag movement
                this.manipulationStartMouse = new THREE.Vector2(event.clientX, event.clientY);

                // Trackball start vector
                this.trackballStart = this.getTrackballVector(event.clientX, event.clientY);

                // Calculate centroid
                this.centroid = new THREE.Vector3();
                selectedAtoms.forEach(a => this.centroid.add(a.position));
                this.centroid.divideScalar(selectedAtoms.length);

                // Store initial positions relative to centroid
                this.initialPositions = new Map();
                selectedAtoms.forEach(a => {
                    this.initialPositions.set(a, a.position.clone());
                });
                return true; // Prevent default
            } else {
                // Empty space or no selection - allow OrbitControls
                if (this.renderer.trackballControls) {
                    this.renderer.trackballControls.noRotate = false;
                    this.renderer.trackballControls.noPan = false;
                }
                return false; // Allow default
            }
        }

        // Default: allow OrbitControls
        return false;
    }

    handleDrag(event, raycaster) {
        if (this.mode === 'edit' && this.ghostBond) {
            // Update ghost bond end
            const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
            const target = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, target);

            // Check for snap to atom
            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom' && i.object.userData.atom !== this.dragStartAtom);

            const endPos = atomMesh ? atomMesh.object.position : target;
            this.updateGhostBond(endPos);
        } else if (this.mode === 'select') {
            this.selectionManager.updateSelection(event.clientX, event.clientY);
        } else if (this.mode === 'move' && this.initialPositions) {
            // Check if we've moved enough to start manipulation
            if (!this.isManipulating && this.manipulationStartMouse) {
                const dx = event.clientX - this.manipulationStartMouse.x;
                const dy = event.clientY - this.manipulationStartMouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Only start manipulating after 3 pixels of movement
                if (dist > 3) {
                    this.isManipulating = true;
                } else {
                    return; // Don't manipulate yet
                }
            }

            if (!this.isManipulating) return;

            const selectedAtoms = this.molecule.atoms.filter(a => a.selected);

            // Only manipulate if we actually started manipulation in handleDragStart
            if (!this.initialPositions || selectedAtoms.length === 0) return;

            if (this.manipulationMode === 'rotate' || this.manipulationMode === 'trackball' || event.altKey) {
                // Trackball Rotation
                const currentTrackball = this.getTrackballVector(event.clientX, event.clientY);
                const startTrackball = this.trackballStart;

                const axisView = new THREE.Vector3().crossVectors(startTrackball, currentTrackball).normalize();
                const angle = startTrackball.angleTo(currentTrackball);

                if (angle > 0.001) {
                    const axisWorld = axisView.clone().transformDirection(this.renderer.activeCamera.matrixWorld);
                    const quaternion = new THREE.Quaternion().setFromAxisAngle(axisWorld, angle * 2);

                    selectedAtoms.forEach(atom => {
                        const initialPos = this.initialPositions.get(atom);
                        const relative = initialPos.clone().sub(this.centroid);
                        relative.applyQuaternion(quaternion);
                        atom.position.copy(this.centroid).add(relative);
                        if (atom.mesh) {
                            atom.mesh.position.copy(atom.position);
                            if (atom.outlineMesh) atom.outlineMesh.position.copy(atom.position);
                        }
                    });
                }
            } else if (this.manipulationMode === 'orbit') {
                // Orbit Rotation - rotate around camera view direction (follows mouse continuously)
                const dx = event.clientX - this.manipulationStartMouse.x;
                const dy = event.clientY - this.manipulationStartMouse.y;

                // Get camera direction (Z axis in camera space)
                const camera = this.renderer.activeCamera;
                const cameraDir = new THREE.Vector3();
                camera.getWorldDirection(cameraDir);

                // Rotation angle based on mouse movement
                const angle = (dx + dy) * 0.01; // Adjust sensitivity

                // Rotate around camera direction axis
                const quaternion = new THREE.Quaternion().setFromAxisAngle(cameraDir, angle);

                selectedAtoms.forEach(atom => {
                    const initialPos = this.initialPositions.get(atom);
                    const relative = initialPos.clone().sub(this.centroid);
                    relative.applyQuaternion(quaternion);
                    atom.position.copy(this.centroid).add(relative);
                    if (atom.mesh) {
                        atom.mesh.position.copy(atom.position);
                        if (atom.outlineMesh) atom.outlineMesh.position.copy(atom.position);
                    }
                });

                // Update initial positions to current positions for continuous rotation
                selectedAtoms.forEach(atom => {
                    this.initialPositions.set(atom, atom.position.clone());
                });
                // Update start mouse position for next frame
                this.manipulationStartMouse.set(event.clientX, event.clientY);
            } else {
                // Camera-Aligned Translation
                const dx = event.clientX - this.manipulationStartMouse.x;
                const dy = event.clientY - this.manipulationStartMouse.y;

                // Get Camera Basis Vectors
                const camera = this.renderer.activeCamera;
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
                const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

                // Scale factor (different for perspective vs orthographic)
                let scale;
                if (camera.isPerspectiveCamera) {
                    // Perspective: FOV scaling
                    const dist = camera.position.distanceTo(this.centroid);
                    const vFov = camera.fov * Math.PI / 180;
                    scale = (2 * Math.tan(vFov / 2) * dist) / window.innerHeight;
                } else {
                    // Orthographic: use zoom and frustum size
                    const frustumHeight = (camera.top - camera.bottom) / camera.zoom;
                    scale = frustumHeight / window.innerHeight;
                }

                const delta = right.multiplyScalar(dx * scale).add(up.multiplyScalar(-dy * scale));

                selectedAtoms.forEach(atom => {
                    const initialPos = this.initialPositions.get(atom);
                    atom.position.copy(initialPos).add(delta);
                    if (atom.mesh) {
                        atom.mesh.position.copy(atom.position);
                        if (atom.outlineMesh) atom.outlineMesh.position.copy(atom.position);
                    }
                });
            }

            this.updateBonds();
        }
    }

    handleDragEnd(event, raycaster) {
        this.renderer.controls.enabled = true; // Always re-enable controls on drag end

        if (this.mode === 'edit' && this.ghostBond) {
            this.renderer.scene.remove(this.ghostBond);
            this.ghostBond = null;

            const intersects = raycaster.intersectObjects(this.renderer.scene.children);
            const atomMesh = intersects.find(i => i.object.userData.type === 'atom' && i.object.userData.atom !== this.dragStartAtom);

            if (atomMesh) {
                // Dragged to an existing atom
                const endAtom = atomMesh.object.userData.atom;

                // Check if bond already exists
                const existingBond = this.molecule.getBond(this.dragStartAtom, endAtom);

                if (existingBond) {
                    // Remove existing bond
                    this.removeBond(existingBond);
                } else {
                    // Add new bond
                    this.addBondToScene(this.dragStartAtom, endAtom);
                }
            } else {
                // Dragged to empty space - create new atom and bond
                // Calculate position on a plane perpendicular to camera, passing through start atom
                const camera = this.renderer.activeCamera || this.renderer.camera;
                const normal = new THREE.Vector3();
                camera.getWorldDirection(normal);

                const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.dragStartAtom.position);
                const target = new THREE.Vector3();
                const intersection = raycaster.ray.intersectPlane(plane, target);

                if (intersection) {
                    // Check if FG is selected
                    if (this.selectedGroup && this.selectedGroup.smiles) {
                        // Set custom direction and bond length based on drag target position
                        const dragVector = new THREE.Vector3().subVectors(target, this.dragStartAtom.position);
                        this._customFGDirection = dragVector.clone().normalize();
                        this._customFGBondLength = dragVector.length();
                        this.addFunctionalGroup(this.dragStartAtom, this.selectedGroup);
                    } else {
                        // Create new atom at the target position
                        const newAtom = this.addAtomToScene(this.selectedElement, target);
                        // Create bond between start atom and new atom
                        this.addBondToScene(this.dragStartAtom, newAtom);
                    }
                }
            }
            this.dragStartAtom = null;
        } else if (this.mode === 'select') {
            this.selectionManager.endSelection(event.clientX, event.clientY, event.shiftKey || event.ctrlKey || event.metaKey);
        } else if (this.mode === 'move') {
            if (this.isManipulating) {
                this.saveState(); // Save after manipulation
            }
            this.isManipulating = false;
            this.initialPositions = null;
            this.manipulationStartMouse = null;
            this.renderer.controls.enabled = true;
        }
    }

    updateBonds() {
        this.molecule.bonds.forEach(bond => {
            if (bond.mesh) {
                const start = bond.atom1.position;
                const end = bond.atom2.position;
                const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                bond.mesh.position.copy(mid);

                // Align cylinder Y-axis to the bond direction
                const axis = new THREE.Vector3().subVectors(end, start).normalize();
                const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
                bond.mesh.setRotationFromQuaternion(quaternion);

                const dist = start.distanceTo(end);
                bond.mesh.scale.set(1, dist, 1); // Scale Y (height) to distance
            }
        });
    }

    createGhostBond(startPos) {
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.6 });
        const mesh = new THREE.Mesh(geometry, material);
        this.renderer.scene.add(mesh);
        return mesh;
    }

    updateGhostBond(endPos) {
        if (!this.ghostBond || !this.dragStartAtom) return;

        const start = this.dragStartAtom.position;
        const dist = start.distanceTo(endPos);

        this.ghostBond.scale.set(1, dist, 1); // Scale Y to match distance (default height is 1)

        const mid = new THREE.Vector3().addVectors(start, endPos).multiplyScalar(0.5);
        this.ghostBond.position.copy(mid);
        this.ghostBond.lookAt(endPos);
        this.ghostBond.rotateX(Math.PI / 2);
    }

    addAtomToScene(element, position, existingAtom = null) {
        // if (!existingAtom) this.saveState(); // Removed: Save after adding

        const atom = existingAtom || this.molecule.addAtom(element, position);

        // Create mesh via RenderManager
        const mesh = this.renderManager.createAtomMesh(atom);
        if (mesh) {
            this.renderer.scene.add(mesh);
            atom.mesh = mesh;
        }

        if (mesh) {
            this.renderer.scene.add(mesh);
            atom.mesh = mesh;
        }

        if (!existingAtom) this.saveState(); // Save after adding
        return atom;
    }

    /**
     * Smart mode: Add atom at optimal position based on VSEPR-like geometry
     * @param {Object} clickedAtom - The atom that was clicked
     */
    async addAtomSmart(clickedAtom) {
        const position = clickedAtom.position.clone();
        const neighbors = clickedAtom.bonds.map(bond =>
            bond.atom1 === clickedAtom ? bond.atom2 : bond.atom1
        );

        // Handle "Hs" special group - add hydrogens to fill valence
        if (this.selectedGroup && this.selectedGroup.action === 'addHydrogens') {
            this.addHydrogensToAtom(clickedAtom);
            this.rebuildScene();
            return;
        }

        // Handle functional group addition
        if (this.selectedGroup && this.selectedGroup.smiles) {
            await this.addFunctionalGroup(clickedAtom, this.selectedGroup);
            return;
        }

        // Calculate optimal direction for new atom
        const optimalDir = this.getOptimalBondDirection(clickedAtom, neighbors);

        // Calculate bond distance (covalent radii sum)
        const element = this.selectedElement || 'C';
        const radius1 = this.getCovalentRadius(clickedAtom.element);
        const radius2 = this.getCovalentRadius(element);
        const bondLength = (radius1 + radius2) * 1.0;

        // Calculate new position
        const newPosition = position.clone().add(optimalDir.multiplyScalar(bondLength));

        // Add the new atom
        const newAtom = this.addAtomToScene(element, newPosition);

        // Create bond between clicked atom and new atom
        this.molecule.addBond(clickedAtom, newAtom);

        this.rebuildScene();
    }

    /**
     * Add a functional group to a clicked atom using OCL 3D generation
     * Uses the deuterium trick: * → [2H], generate 3D, then substitute
     * @param {Object} clickedAtom - The atom to attach to
     * @param {Object} group - Functional group object with smiles
     */
    async addFunctionalGroup(clickedAtom, group) {
        if (!group.smiles) {
            console.error('No SMILES for functional group');
            return;
        }

        try {
            // Replace * with [2H] (Deuterium) for proper valence handling
            const processingSmiles = group.smiles.replace(/\[\*\]/g, '[2H]').replace(/\*/g, '[2H]');

            // Generate 3D coordinates using OCL (includes hydrogen addition)
            const mol3D = await oclManager.generate3D(processingSmiles);
            const molBlock = mol3D.toMolfile();

            // Parse MolBlock to extract atoms and bonds
            const lines = molBlock.split('\n');
            let atomCount = 0, bondCount = 0;
            let lineIndex = 0;

            // Find counts line
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('V2000')) {
                    const parts = lines[i].trim().split(/\s+/);
                    atomCount = parseInt(parts[0]);
                    bondCount = parseInt(parts[1]);
                    lineIndex = i + 1;
                    break;
                }
            }

            // Parse atoms
            const fgAtoms = [];
            let deuteriumIndex = -1;

            for (let i = 0; i < atomCount; i++) {
                const line = lines[lineIndex + i];
                const parts = line.trim().split(/\s+/);
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                const z = parseFloat(parts[2]);
                let element = parts[3];

                // V2000 format: x y z element massDiff charge stereo etc
                // For Deuterium: element='H', massDiff=1 (since D = H + 1 neutron)
                const massDiff = parts.length > 4 ? parseInt(parts[4]) : 0;

                // Detect Deuterium: D, 2H, or H with mass difference 1
                if (element === 'D' || element === '2H' ||
                    (element === 'H' && massDiff === 1)) {
                    deuteriumIndex = i;
                    element = 'X'; // Mark as dummy
                    console.log('Found Deuterium at index', i, 'massDiff:', massDiff);
                }

                fgAtoms.push({ element, x, y, z, index: i });
            }

            // Fallback: if no Deuterium found, use the first H as attachment point
            if (deuteriumIndex === -1) {
                for (let i = 0; i < fgAtoms.length; i++) {
                    if (fgAtoms[i].element === 'H') {
                        deuteriumIndex = i;
                        fgAtoms[i].element = 'X';
                        console.log('Fallback: using first H at index', i, 'as attachment');
                        break;
                    }
                }
            }

            // Parse bonds
            const fgBonds = [];
            let deuteriumNeighbor = -1;

            for (let i = 0; i < bondCount; i++) {
                const line = lines[lineIndex + atomCount + i];
                const parts = line.trim().split(/\s+/);
                const a1 = parseInt(parts[0]) - 1; // 0-indexed
                const a2 = parseInt(parts[1]) - 1;
                fgBonds.push([a1, a2]);

                // Find which atom is connected to Deuterium
                if (a1 === deuteriumIndex) deuteriumNeighbor = a2;
                if (a2 === deuteriumIndex) deuteriumNeighbor = a1;
            }

            if (deuteriumIndex === -1 || deuteriumNeighbor === -1) {
                console.error('Could not find attachment point in FG');
                return;
            }

            // Calculate direction for FG attachment
            // Use customDirection if provided (Manual mode), otherwise VSEPR optimal (Smart mode)
            let optimalDir;
            if (this._customFGDirection) {
                optimalDir = this._customFGDirection.clone().normalize();
                this._customFGDirection = null; // Clear after use
            } else {
                const neighbors = clickedAtom.bonds.map(b =>
                    b.atom1 === clickedAtom ? b.atom2 : b.atom1);
                optimalDir = this.getOptimalBondDirection(clickedAtom, neighbors);
            }

            // The anchor atom is the one connected to Deuterium (not the Dummy itself)
            const anchorFGAtom = fgAtoms[deuteriumNeighbor];
            const dummyAtom = fgAtoms[deuteriumIndex];

            // Calculate bond direction from Deuterium → anchor in FG coords
            const fgBondDir = new THREE.Vector3(
                anchorFGAtom.x - dummyAtom.x,
                anchorFGAtom.y - dummyAtom.y,
                anchorFGAtom.z - dummyAtom.z
            ).normalize();

            // Calculate rotation to align FG bond direction with optimal direction
            const quaternion = new THREE.Quaternion().setFromUnitVectors(fgBondDir, optimalDir);

            // Calculate bond length: use custom length (Manual mode) or covalent radii (Smart mode)
            let bondLength;
            if (this._customFGBondLength) {
                bondLength = this._customFGBondLength;
                this._customFGBondLength = null; // Clear after use
            } else {
                bondLength = this.getCovalentRadius(clickedAtom.element) +
                    this.getCovalentRadius(anchorFGAtom.element);
            }

            // Position of anchor atom
            const anchorPosition = clickedAtom.position.clone().add(
                optimalDir.clone().multiplyScalar(bondLength)
            );

            // Add all atoms except Deuterium (dummy)
            const newAtoms = [];
            const indexMap = {}; // Map old indices to new atoms

            for (let i = 0; i < fgAtoms.length; i++) {
                if (i === deuteriumIndex) {
                    indexMap[i] = null; // Skip dummy
                    continue;
                }

                const atomData = fgAtoms[i];

                // Position relative to anchor atom
                const relPos = new THREE.Vector3(
                    atomData.x - anchorFGAtom.x,
                    atomData.y - anchorFGAtom.y,
                    atomData.z - anchorFGAtom.z
                );

                // Apply rotation
                relPos.applyQuaternion(quaternion);

                // Final position
                const finalPos = anchorPosition.clone().add(relPos);

                const newAtom = this.molecule.addAtom(atomData.element, finalPos);
                newAtoms.push(newAtom);
                indexMap[i] = newAtom;
            }

            // Add bond from clicked atom to anchor atom
            const anchorNewAtom = indexMap[deuteriumNeighbor];
            if (anchorNewAtom) {
                this.molecule.addBond(clickedAtom, anchorNewAtom);
            }

            // Add internal bonds (skip bonds to dummy)
            for (const [a1, a2] of fgBonds) {
                if (a1 === deuteriumIndex || a2 === deuteriumIndex) continue;
                if (indexMap[a1] && indexMap[a2]) {
                    this.molecule.addBond(indexMap[a1], indexMap[a2]);
                }
            }

            this.rebuildScene();
            this.saveState();

        } catch (error) {
            console.error('Error adding functional group:', error);
        }
    }

    /**
     * Calculate optimal bond direction based on existing bonds (VSEPR-like)
     * @param {Object} atom - Center atom
     * @param {Array} neighbors - Array of neighbor atoms
     * @returns {THREE.Vector3} Normalized direction vector
     */
    getOptimalBondDirection(atom, neighbors) {
        const position = atom.position;

        if (neighbors.length === 0) {
            // No neighbors: add in +X direction
            return new THREE.Vector3(1, 0, 0);
        }

        if (neighbors.length === 1) {
            // One neighbor: add in opposite direction (180°)
            const dir = new THREE.Vector3().subVectors(position, neighbors[0].position).normalize();
            return dir;
        }

        if (neighbors.length === 2) {
            // Two neighbors: place in plane, 120° from both
            const v1 = new THREE.Vector3().subVectors(neighbors[0].position, position).normalize();
            const v2 = new THREE.Vector3().subVectors(neighbors[1].position, position).normalize();

            // Average direction, then negate
            const avgDir = new THREE.Vector3().addVectors(v1, v2).normalize();
            if (avgDir.length() < 0.01) {
                // Neighbors are opposite - choose perpendicular direction
                const perp = new THREE.Vector3(0, 1, 0);
                if (Math.abs(v1.dot(perp)) > 0.9) perp.set(1, 0, 0);
                return perp.cross(v1).normalize();
            }
            return avgDir.negate();
        }

        if (neighbors.length === 3) {
            // Three neighbors: tetrahedral, add opposite to average
            const avgDir = new THREE.Vector3();
            neighbors.forEach(n => {
                avgDir.add(new THREE.Vector3().subVectors(n.position, position));
            });
            avgDir.normalize();
            return avgDir.negate();
        }

        // 4+ neighbors: saturated, still try opposite of average
        const avgDir = new THREE.Vector3();
        neighbors.forEach(n => {
            avgDir.add(new THREE.Vector3().subVectors(n.position, position));
        });
        return avgDir.normalize().negate();
    }

    /**
     * Get covalent radius for an element
     * @param {string} element 
     * @returns {number} Covalent radius in Angstroms
     */
    getCovalentRadius(element) {
        if (ELEMENTS[element] && ELEMENTS[element].radius) {
            return ELEMENTS[element].radius;
        }
        return 0.76; // Default to Carbon
    }

    /**
     * Add hydrogens to fill valence of an atom
     * Uses proper tetrahedral/trigonal geometry for multiple hydrogens
     * @param {Object} atom 
     */
    addHydrogensToAtom(atom) {
        const maxValence = this.getMaxValence(atom.element);
        const currentBonds = atom.bonds.length;
        const needed = maxValence - currentBonds;

        if (needed <= 0) return;

        const bondLength = this.getCovalentRadius(atom.element) + this.getCovalentRadius('H');
        const neighbors = atom.bonds.map(b => b.atom1 === atom ? b.atom2 : b.atom1);

        // Calculate all hydrogen directions at once based on total coordination
        const totalCoord = currentBonds + needed;
        const hDirections = this.getMultipleBondDirections(atom, neighbors, needed, totalCoord);

        // Add all hydrogens
        for (const dir of hDirections) {
            const newPos = atom.position.clone().add(dir.multiplyScalar(bondLength));
            const hAtom = this.molecule.addAtom('H', newPos);
            this.molecule.addBond(atom, hAtom);
        }
    }

    /**
     * Calculate multiple bond directions for adding atoms (e.g., hydrogens)
     * @param {Object} atom - Center atom
     * @param {Array} neighbors - Existing neighbor atoms
     * @param {number} count - Number of new directions needed
     * @param {number} totalCoord - Total coordination number (existing + new)
     * @returns {Array<THREE.Vector3>} Array of normalized direction vectors
     */
    getMultipleBondDirections(atom, neighbors, count, totalCoord) {
        const position = atom.position;
        const directions = [];

        // Get existing bond directions
        const existingDirs = neighbors.map(n =>
            new THREE.Vector3().subVectors(n.position, position).normalize()
        );

        if (neighbors.length === 0) {
            // No neighbors - arrange based on total geometry
            if (totalCoord === 1) {
                directions.push(new THREE.Vector3(1, 0, 0));
            } else if (totalCoord === 2) {
                // Linear
                directions.push(new THREE.Vector3(1, 0, 0));
                directions.push(new THREE.Vector3(-1, 0, 0));
            } else if (totalCoord === 3) {
                // Trigonal planar
                directions.push(new THREE.Vector3(1, 0, 0));
                directions.push(new THREE.Vector3(-0.5, 0.866, 0));
                directions.push(new THREE.Vector3(-0.5, -0.866, 0));
            } else if (totalCoord === 4) {
                // Tetrahedral
                const a = 1 / Math.sqrt(3);
                directions.push(new THREE.Vector3(a, a, a));
                directions.push(new THREE.Vector3(a, -a, -a));
                directions.push(new THREE.Vector3(-a, a, -a));
                directions.push(new THREE.Vector3(-a, -a, a));
            }
            return directions.slice(0, count);
        }

        if (neighbors.length === 1) {
            const oppDir = existingDirs[0].clone().negate();

            if (count === 1) {
                // Just opposite
                directions.push(oppDir);
            } else if (count === 2) {
                // Two more for trigonal planar or tetrahedral
                // Use perpendicular directions
                const perp1 = new THREE.Vector3(0, 1, 0);
                if (Math.abs(oppDir.dot(perp1)) > 0.9) perp1.set(1, 0, 0);
                const perp2 = new THREE.Vector3().crossVectors(oppDir, perp1).normalize();
                perp1.crossVectors(perp2, oppDir).normalize();

                if (totalCoord === 3) {
                    // Trigonal planar: 120° apart from existing
                    const angle = Math.PI * 2 / 3;
                    directions.push(oppDir.clone().applyAxisAngle(perp2, angle / 2));
                    directions.push(oppDir.clone().applyAxisAngle(perp2, -angle / 2));
                } else {
                    // Tetrahedral: ~109.5° - two hydrogens straddling the opposite direction
                    const tetraAngle = Math.acos(-1 / 3); // 109.47°
                    // Rotate from the existing bond direction, not opposite
                    const bondDir = existingDirs[0].clone();
                    directions.push(bondDir.clone().applyAxisAngle(perp1, tetraAngle).applyAxisAngle(bondDir, Math.PI / 3));
                    directions.push(bondDir.clone().applyAxisAngle(perp1, tetraAngle).applyAxisAngle(bondDir, -Math.PI / 3));
                }
            } else if (count === 3) {
                // Three more for tetrahedral - arrange around the axis opposite to existing bond
                const tetraAngle = Math.acos(-1 / 3); // 109.47°
                const bondDir = existingDirs[0].clone();
                for (let i = 0; i < 3; i++) {
                    const rot = bondDir.clone();
                    const perp = new THREE.Vector3(0, 1, 0);
                    if (Math.abs(bondDir.dot(perp)) > 0.9) perp.set(1, 0, 0);
                    const axis = new THREE.Vector3().crossVectors(bondDir, perp).normalize();
                    rot.applyAxisAngle(axis, tetraAngle);
                    rot.applyAxisAngle(bondDir, i * (2 * Math.PI / 3));
                    directions.push(rot.normalize());
                }
            }
        } else if (neighbors.length === 2) {
            // Average of existing, then negate for bisector
            const avg = existingDirs[0].clone().add(existingDirs[1]).normalize();

            if (count === 1) {
                directions.push(avg.clone().negate());
            } else if (count === 2) {
                // Tetrahedral: two positions perpendicular to the plane and opposite to avg
                const normal = new THREE.Vector3().crossVectors(existingDirs[0], existingDirs[1]).normalize();
                const bisector = avg.clone().negate();
                const tetraAngle = Math.acos(-1 / 3) / 2;
                // Fix for planar hydrogens: rotate 'bisector' out of the plane defined by existing bonds
                // 'normal' is perpendicular to existing bond plane. 'bisector' is in that plane.
                // We rotate around 'axis' which is in the plane and perpendicular to 'bisector'.
                const axis = new THREE.Vector3().crossVectors(bisector, normal).normalize();

                directions.push(bisector.clone().applyAxisAngle(axis, tetraAngle));
                directions.push(bisector.clone().applyAxisAngle(axis, -tetraAngle));
            }
        } else if (neighbors.length === 3) {
            // One position opposite to average of three
            const avg = existingDirs[0].clone().add(existingDirs[1]).add(existingDirs[2]).normalize();
            directions.push(avg.clone().negate());
        }

        return directions.slice(0, count);
    }

    /**
     * Get maximum valence for an element
     * @param {string} element 
     * @returns {number}
     */
    getMaxValence(element) {
        const valences = {
            'H': 1, 'C': 4, 'N': 3, 'O': 2, 'F': 1, 'Cl': 1, 'Br': 1, 'I': 1,
            'P': 5, 'S': 6, 'Si': 4, 'B': 3
        };
        return valences[element] || 4; // Default to 4
    }

    removeBond(bond) {
        // Remove from molecule
        this.molecule.removeBond(bond);

        // Update scene
        this.rebuildScene();
        this.saveState(); // Save after removing
    }

    addBondToScene(atom1, atom2) {
        // Add to molecule
        this.molecule.addBond(atom1, atom2);

        // Update scene
        this.rebuildScene();
        this.saveState(); // Save after adding
    }

    saveState() {
        // Remove any future history if we are in the middle
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        const state = this.molecule.toJSON(); // Use JSON to preserve bonds
        this.history.push(state);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
        console.log('State saved. History size:', this.history.length, 'Index:', this.historyIndex);
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const state = this.history[this.historyIndex];
            this.restoreState(state);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const state = this.history[this.historyIndex];
            this.restoreState(state);
        }
    }

    deleteSelected() {
        this.selectionManager.deleteSelected();
    }

    restoreState(state) {
        this.molecule.fromJSON(state);
        this.rebuildScene();
    }

    // Old getElementColor removed
    // getElementColor(element) { ... }

    openCoordinateEditor(initialFormat = 'xyz') {
        this.uiManager.openCoordinateEditor(initialFormat);
    }

    closeCoordinateEditor() {
        this.uiManager.closeCoordinateEditor();
    }



    rebuildScene() {
        this.renderManager.rebuildScene();
    }

    autoBond() {
        const thresholdFactor = parseFloat(document.getElementById('bond-threshold').value);
        // this.saveState(); // Removed: Save after bonding

        // Delegate to MoleculeManager
        const bondsAdded = this.moleculeManager.autoBond(thresholdFactor);

        if (bondsAdded > 0) {
            this.rebuildScene();
            this.saveState(); // Save after bonding
        }
    }



    // getElementColor and getElementRadius removed (moved to RenderManager)



    updateAtomColors() {
        this.renderManager.updateAtomColors();
    }

    renderPeriodicTable() {
        this.uiManager.renderPeriodicTable();
    }

    // createAtomMesh removed (duplicate)
    // createAtomLabel removed (moved to UIManager)

    // updateAtomLabelText removed (moved to UIManager)

    updateAllLabels() {
        this.uiManager.updateAllLabels();
    }

    updateLabelPositions() {
        this.uiManager.updateLabelPositions();
    }

    async checkLocalMode() {
        try {
            const response = await fetch('/api/init');
            if (response.ok) {
                const data = await response.json();
                this.isLocalMode = true;
                this.initialArgs = data.args || [];
                console.log('Running in Local Mode. Args:', this.initialArgs);

                // Process initial arguments
                if (this.initialArgs.length > 0) {
                    this.fileIOManager.processInitialArgs(this.initialArgs);
                }

                // Start Heartbeat
                this.startHeartbeat();
            }
        } catch (e) {
            // Not in local mode or server not responding
            console.log('Running in Web Mode');
        }
    }

    startHeartbeat() {
        setInterval(async () => {
            try {
                await fetch('/api/heartbeat');
            } catch (e) {
                console.error('Heartbeat failed:', e);
            }
        }, 1000); // Send heartbeat every 1 second for instant shutdown detection
    }

    /**
     * Setup beforeunload and pagehide handlers for data loss prevention and server shutdown
     */
    setupBeforeUnload() {
        // Show browser default warning when there's unsaved data
        window.addEventListener('beforeunload', (event) => {
            if (this.hasUnsavedData()) {
                // Modern browsers show their own message, we just need to preventDefault
                event.preventDefault();
                event.returnValue = ''; // Chrome requires returnValue to be set
                return ''; // Legacy browsers
            }
        });

        // Send shutdown signal when page actually closes
        window.addEventListener('pagehide', () => {
            this.shutdownServer();
        });
    }

    /**
     * Check if there is unsaved data (atoms in molecule)
     * @returns {boolean}
     */
    hasUnsavedData() {
        return this.molecule && this.molecule.atoms.length > 0;
    }

    /**
     * Shutdown the server gracefully
     */
    shutdownServer() {
        // Use sendBeacon for reliability when page is closing
        // (fetch with keepalive might not complete in time)
        const data = JSON.stringify({ timestamp: Date.now() });
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon('/api/shutdown', blob);
        console.log('Shutdown signal sent to server.');
    }

    // createBondMesh moved to RenderManager

    updateMeasurements() {
        // Measurements are now displayed in the top-left corner via updateSelectionInfo
    }

    toggleMaximize(element) {
        this.uiManager.toggleMaximize(element);
    }
}
