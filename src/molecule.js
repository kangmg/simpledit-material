import * as THREE from 'three';

export class Atom {
    constructor(element, position, id) {
        this.element = element;
        // Ensure position is a Vector3
        this.position = new THREE.Vector3(position.x, position.y, position.z);
        this.id = id;
        this.bonds = [];
        this.mesh = null;
        this.selected = false;
    }
}

export class Bond {
    constructor(atom1, atom2, order = 1) {
        this.atom1 = atom1;
        this.atom2 = atom2;
        this.order = order;
        this.mesh = null;
        this.id = `${atom1.id}-${atom2.id}`;
    }
}

export class Molecule {
    constructor(name = 'Molecule') {
        this.name = name;
        this.atoms = [];
        this.bonds = [];
        this.nextAtomId = 1;
    }

    addAtom(element, position) {
        const atom = new Atom(element, position, this.nextAtomId++);
        this.atoms.push(atom);
        return atom;
    }

    addBond(atom1, atom2, order = 1) {
        // Check if bond already exists
        const existing = this.bonds.find(b =>
            (b.atom1 === atom1 && b.atom2 === atom2) ||
            (b.atom1 === atom2 && b.atom2 === atom1)
        );
        if (existing) return existing;

        const bond = new Bond(atom1, atom2, order);
        this.bonds.push(bond);
        atom1.bonds.push(bond);
        atom2.bonds.push(bond);
        return bond;
    }

    removeBond(bond) {
        // Remove references from atoms
        const idx1 = bond.atom1.bonds.indexOf(bond);
        if (idx1 !== -1) bond.atom1.bonds.splice(idx1, 1);

        const idx2 = bond.atom2.bonds.indexOf(bond);
        if (idx2 !== -1) bond.atom2.bonds.splice(idx2, 1);

        // Remove from molecule bonds array
        const idx = this.bonds.indexOf(bond);
        if (idx !== -1) this.bonds.splice(idx, 1);
    }

    getBond(atom1, atom2) {
        return this.bonds.find(b =>
            (b.atom1 === atom1 && b.atom2 === atom2) ||
            (b.atom1 === atom2 && b.atom2 === atom1)
        );
    }

    removeAtom(atom) {
        this.atoms = this.atoms.filter(a => a !== atom);
        // Remove associated bonds
        this.bonds = this.bonds.filter(b => {
            if (b.atom1 === atom || b.atom2 === atom) {
                // Remove bond from other atom's list
                const other = b.atom1 === atom ? b.atom2 : b.atom1;
                other.bonds = other.bonds.filter(ob => ob !== b);
                return false;
            }
            return true;
        });
    }

    clear() {
        this.atoms = [];
        this.bonds = [];
        this.nextAtomId = 1;
    }

    toJSON() {
        return {
            atoms: this.atoms.map(a => ({
                id: a.id,
                element: a.element,
                x: a.position.x,
                y: a.position.y,
                z: a.position.z
            })),
            bonds: this.bonds.map(b => ({
                atom1Id: b.atom1.id,
                atom2Id: b.atom2.id,
                order: b.order
            }))
        };
    }

    fromJSON(data) {
        this.clear();
        const atomMap = new Map();

        // Recreate atoms
        data.atoms.forEach(a => {
            const atom = new Atom(a.element, new THREE.Vector3(a.x, a.y, a.z), a.id);
            this.atoms.push(atom);
            atomMap.set(a.id, atom);
            // Update nextAtomId to avoid collisions
            if (a.id >= this.nextAtomId) this.nextAtomId = a.id + 1;
        });

        // Recreate bonds
        data.bonds.forEach(b => {
            const atom1 = atomMap.get(b.atom1Id);
            const atom2 = atomMap.get(b.atom2Id);
            if (atom1 && atom2) {
                this.addBond(atom1, atom2, b.order);
            }
        });
    }
}
