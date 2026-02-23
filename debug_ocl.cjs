
const OCL = require('openchemlib');

async function test() {
    try {
        console.log('Initializing...');

        const mol = new OCL.Molecule(10, 10);
        const c = mol.addAtom(6);
        const o = mol.addAtom(8);
        const h = mol.addAtom(1);

        mol.setAtomX(c, 0); mol.setAtomY(c, 0); mol.setAtomZ(c, 0);
        mol.setAtomX(o, 1.2); mol.setAtomY(o, 0); mol.setAtomZ(o, 0);
        mol.setAtomX(h, -0.5); mol.setAtomY(h, 0.9); mol.setAtomZ(h, 0);

        mol.addBond(c, o, 2); // Double bond inferred
        mol.addBond(c, h, 1); // Single bond

        console.log('Molecule created. Atoms:', mol.getAllAtoms());
        console.log('SMILES:', mol.toSmiles());

        mol.addImplicitHydrogens();
        console.log('After implicit H. Atoms:', mol.getAllAtoms());

        console.log('Generating 3D...');
        const generator = new OCL.ConformerGenerator(42);
        const conformer = generator.getOneConformerAsMolecule(mol);

        if (conformer) {
            console.log('Success! 3D generated.');
            console.log(conformer.toMolfile());
        } else {
            console.error('Conformer generation failed (returned null)');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
