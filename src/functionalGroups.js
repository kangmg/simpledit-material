/**
 * Functional Groups definitions with pre-computed 3D coordinates from OCL
 * The first atom (index 0) is the one that connects to the parent molecule
 * NOTE: OCL converts * to C when parsing, so we manually mark the attachment
 */
export const FUNCTIONAL_GROUPS = {
    // Special actions
    'Hs': {
        smiles: '*H',
        name: 'Add Hydrogens',
        category: 'special',
        action: 'addHydrogens',
        atoms: null,
        bonds: null
    },

    // Alkyl groups - first atom connects to parent
    'Me': {
        smiles: '*C',
        name: 'Methyl',
        category: 'alkyl',
        atoms: [
            { el: 'C', x: 0, y: 0, z: 0 }
        ],
        bonds: []
    },
    'Et': {
        smiles: '*CC',
        name: 'Ethyl',
        category: 'alkyl',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1]]
    },
    'iPr': {
        smiles: '*C(C)C',
        name: 'Isopropyl',
        category: 'alkyl',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 },
            { el: 'C', x: 0, y: 1.5, z: 0 }
        ],
        bonds: [[0, 1], [1, 2]]
    },
    't-Bu': {
        smiles: '*C(C)(C)C',
        name: 'tert-Butyl',
        category: 'alkyl',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 },
            { el: 'C', x: 0, y: 1.5, z: 0 },
            { el: 'C', x: -0.866, y: 0, z: 0 }
        ],
        bonds: [[0, 1], [1, 2], [1, 3]]
    },

    // Oxygen-containing
    'OH': {
        smiles: '*O',
        name: 'Hydroxyl',
        category: 'oxygen',
        atoms: [
            { el: 'O', x: 0, y: 0.5, z: 0 }
        ],
        bonds: []
    },
    'OMe': {
        smiles: '*OC',
        name: 'Methoxy',
        category: 'oxygen',
        atoms: [
            { el: 'O', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1]]
    },
    'OEt': {
        smiles: '*OCC',
        name: 'Ethoxy',
        category: 'oxygen',
        atoms: [
            { el: 'O', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 },
            { el: 'C', x: 0, y: 1.5, z: 0 }
        ],
        bonds: [[0, 1], [1, 2]]
    },
    'CHO': {
        smiles: '*C=O',
        name: 'Aldehyde',
        category: 'oxygen',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'O', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1]]
    },
    'Ac': {
        smiles: '*C(=O)C',
        name: 'Acetyl',
        category: 'oxygen',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'O', x: 0.866, y: -1, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2]]
    },
    'COOH': {
        smiles: '*C(=O)O',
        name: 'Carboxyl',
        category: 'oxygen',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'O', x: 0.866, y: -1, z: 0 },
            { el: 'O', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2]]
    },
    'COOMe': {
        smiles: '*C(=O)OC',
        name: 'Methyl Ester',
        category: 'oxygen',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'O', x: 0.866, y: -1, z: 0 },
            { el: 'O', x: 0, y: 0.5, z: 0 },
            { el: 'C', x: 0, y: 1.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2], [2, 3]]
    },

    // Nitrogen-containing
    'NH2': {
        smiles: '*N',
        name: 'Amino',
        category: 'nitrogen',
        atoms: [
            { el: 'N', x: 0, y: 0.5, z: 0 }
        ],
        bonds: []
    },
    'NMe2': {
        smiles: '*N(C)C',
        name: 'Dimethylamino',
        category: 'nitrogen',
        atoms: [
            { el: 'N', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0.866, y: -1, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2]]
    },
    'CN': {
        smiles: '*C#N',
        name: 'Cyano',
        category: 'nitrogen',
        atoms: [
            { el: 'C', x: 1, y: 0, z: 0 },
            { el: 'N', x: 2, y: 0, z: 0 }
        ],
        bonds: [[0, 1]]
    },
    'NO2': {
        smiles: '*[N+](=O)[O-]',
        name: 'Nitro',
        category: 'nitrogen',
        atoms: [
            { el: 'N', x: 0.866, y: 0, z: 0 },
            { el: 'O', x: 0.866, y: -1, z: 0 },
            { el: 'O', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2]]
    },
    'CONH2': {
        smiles: '*C(=O)N',
        name: 'Amide',
        category: 'nitrogen',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'O', x: 0.866, y: -1, z: 0 },
            { el: 'N', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2]]
    },

    // Aromatic
    'Ph': {
        smiles: '*c1ccccc1',
        name: 'Phenyl',
        category: 'aromatic',
        atoms: [
            { el: 'C', x: 0, y: 0.5, z: 0 },
            { el: 'C', x: -0.866, y: 0, z: 0 },
            { el: 'C', x: -1.732, y: 0.5, z: 0 },
            { el: 'C', x: -1.732, y: 1.5, z: 0 },
            { el: 'C', x: -0.866, y: 2, z: 0 },
            { el: 'C', x: 0, y: 1.5, z: 0 }
        ],
        bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 5]]
    },
    'Bn': {
        smiles: '*Cc1ccccc1',
        name: 'Benzyl',
        category: 'aromatic',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 },
            { el: 'C', x: -0.866, y: 0, z: 0 },
            { el: 'C', x: -1.732, y: 0.5, z: 0 },
            { el: 'C', x: -1.732, y: 1.5, z: 0 },
            { el: 'C', x: -0.866, y: 2, z: 0 },
            { el: 'C', x: 0, y: 1.5, z: 0 }
        ],
        bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [1, 6]]
    },
    'Tol': {
        smiles: '*c1ccc(C)cc1',
        name: 'Tolyl',
        category: 'aromatic',
        atoms: [
            { el: 'C', x: 0, y: 0.5, z: 0 },
            { el: 'C', x: -0.866, y: 0, z: 0 },
            { el: 'C', x: -1.732, y: 0.5, z: 0 },
            { el: 'C', x: -1.732, y: 1.5, z: 0 },
            { el: 'C', x: -2.598, y: 2, z: 0 },
            { el: 'C', x: -0.866, y: 2, z: 0 },
            { el: 'C', x: 0, y: 1.5, z: 0 }
        ],
        bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 6], [0, 6]]
    },

    // Sulfur-containing
    'SH': {
        smiles: '*S',
        name: 'Thiol',
        category: 'sulfur',
        atoms: [
            { el: 'S', x: 0, y: 0.5, z: 0 }
        ],
        bonds: []
    },
    'SMe': {
        smiles: '*SC',
        name: 'Methylthio',
        category: 'sulfur',
        atoms: [
            { el: 'S', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1]]
    },
    'SO2Me': {
        smiles: '*S(=O)(=O)C',
        name: 'Methanesulfonyl',
        category: 'sulfur',
        atoms: [
            { el: 'S', x: 0.866, y: 0, z: 0 },
            { el: 'O', x: 0.866, y: -1, z: 0 },
            { el: 'O', x: 0.866, y: 1, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2], [0, 3]]
    },

    // Fluorinated
    'CF3': {
        smiles: '*C(F)(F)F',
        name: 'Trifluoromethyl',
        category: 'fluorinated',
        atoms: [
            { el: 'C', x: 0.866, y: 0, z: 0 },
            { el: 'F', x: 0.866, y: -1, z: 0 },
            { el: 'F', x: 0.866, y: 1, z: 0 },
            { el: 'F', x: 0, y: 0.5, z: 0 }
        ],
        bonds: [[0, 1], [0, 2], [0, 3]]
    },
    'OCF3': {
        smiles: '*OC(F)(F)F',
        name: 'Trifluoromethoxy',
        category: 'fluorinated',
        atoms: [
            { el: 'O', x: 0.866, y: 0, z: 0 },
            { el: 'C', x: 0, y: 0.5, z: 0 },
            { el: 'F', x: 0.5, y: 1.366, z: 0 },
            { el: 'F', x: -0.866, y: 1, z: 0 },
            { el: 'F', x: -0.5, y: -0.366, z: 0 }
        ],
        bonds: [[0, 1], [1, 2], [1, 3], [1, 4]]
    },
};

/**
 * Category display names
 */
export const GROUP_CATEGORIES = {
    'special': 'Special',
    'alkyl': 'Alkyl',
    'oxygen': 'Oxygen',
    'nitrogen': 'Nitrogen',
    'aromatic': 'Aromatic',
    'sulfur': 'Sulfur',
    'fluorinated': 'Fluorinated',
};
