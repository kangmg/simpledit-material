# Simpledit API Usage Guide

This guide provides examples of how to use the Simpledit API for common molecular editing tasks.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Atom and Bond Operations](#atom-and-bond-operations)
- [Geometry Manipulation](#geometry-manipulation)
- [File I/O Operations](#file-io-operations)
- [Selection Management](#selection-management)
- [Advanced Features](#advanced-features)

## Basic Setup

```javascript
// Import the Editor class
import { Editor } from './src/editor.js';

// Create a new editor instance
const editor = new Editor();

// Access the active molecule
const molecule = editor.molecule;
```

## Atom and Bond Operations

### Adding Atoms

```javascript
// Add a carbon atom at position (0, 0, 0)
const carbon = editor.addAtomToScene('C', new THREE.Vector3(0, 0, 0));

// Add an oxygen atom at position (1.2, 0, 0)
const oxygen = editor.addAtomToScene('O', new THREE.Vector3(1.2, 0, 0));
```

### Creating Bonds

```javascript
// Create a bond between two atoms
editor.addBondToScene(carbon, oxygen);

// Remove a bond
const bond = molecule.getBond(carbon, oxygen);
editor.removeBond(bond);
```

### Removing Atoms

```javascript
// Remove an atom
molecule.removeAtom(oxygen);

// Clear all atoms
molecule.clear();
```

## Geometry Manipulation

### Bond Length Adjustment

```javascript
// Select two atoms
editor.selectionManager.selectAtom(carbon);
editor.selectionManager.selectAtom(oxygen);

// Set bond length to 1.5 Å
editor.geometryController.setBondLength(1.5);
```

### Angle Adjustment

```javascript
// Select three atoms (for angle adjustment)
const hydrogen = editor.addAtomToScene('H', new THREE.Vector3(0, 1, 0));
editor.selectionManager.selectAtom(carbon);
editor.selectionManager.selectAtom(oxygen);
editor.selectionManager.selectAtom(hydrogen);

// Set angle to 120 degrees
editor.geometryController.setAngle(120);
```

### Dihedral Angle Adjustment

```javascript
// Select four atoms (for dihedral adjustment)
const hydrogen2 = editor.addAtomToScene('H', new THREE.Vector3(1.2, 1, 0));
editor.selectionManager.selectAtom(carbon);
editor.selectionManager.selectAtom(oxygen);
editor.selectionManager.selectAtom(hydrogen);
editor.selectionManager.selectAtom(hydrogen2);

// Set dihedral angle to 180 degrees
editor.geometryController.setDihedral(180);
```

## File I/O Operations

### Exporting Molecules

```javascript
// Export as XYZ format
const xyzContent = editor.fileIOManager.exportXYZ();
console.log(xyzContent);

// Export as SDF format
const sdfContent = editor.fileIOManager.exportSDF();
console.log(sdfContent);

// Export as JSON
const jsonContent = editor.fileIOManager.exportJSON();
console.log(jsonContent);
```

### Importing Molecules

```javascript
// Import from XYZ
const xyzData = `3\n\nC 0.0 0.0 0.0\nO 1.2 0.0 0.0\nH 0.0 1.0 0.0`;
editor.fileIOManager.importXYZ(xyzData);

// Import from SDF
const sdfData = `...`; // SDF content
editor.fileIOManager.importSDF(sdfData);
```

## Selection Management

### Basic Selection

```javascript
// Select a single atom
editor.selectionManager.selectAtom(carbon);

// Deselect an atom
editor.selectionManager.deselectAtom(carbon);

// Clear all selection
editor.selectionManager.clearSelection();
```

### Advanced Selection

```javascript
// Select multiple atoms
editor.selectionManager.selectAtom(carbon, true); // Add to selection
editor.selectionManager.selectAtom(oxygen, true); // Add to selection

// Select by indices
editor.selectionManager.selectByIndices([0, 1, 2]);

// Select range
editor.selectionManager.selectRange(0, 5); // Select atoms 0-5

// Invert selection
editor.selectionManager.invertSelection();
```

## Advanced Features

### Multi-Molecule Support

```javascript
// Create a new molecule
const newMolecule = editor.moleculeManager.createMolecule('Molecule 2');

// Switch between molecules
editor.moleculeManager.switchMolecule(0); // Switch to first molecule
editor.moleculeManager.switchMolecule(1); // Switch to second molecule

// Remove a molecule
editor.moleculeManager.removeMolecule(1);
```

### Undo/Redo

```javascript
// Save current state
editor.saveState();

// Perform some operations...

// Undo last operation
editor.undo();

// Redo undone operation
editor.redo();
```

### Camera and View Control

```javascript
// Set camera mode
editor.renderer.setCameraMode('orbit'); // or 'trackball'

// Set projection mode
editor.renderer.setProjection('perspective'); // or 'orthographic'

// Capture screenshot
const screenshot = editor.renderer.captureSnapshot();
```

## Error Handling

```javascript
// Most operations return standardized responses
const result = editor.fileIOManager.importXYZ(invalidData);

if (result.error) {
    console.error('Error:', result.error);
} else if (result.success) {
    console.log('Success:', result.success);
}
```

## Best Practices

1. **State Management**: Always save state before major operations:
   ```javascript
   editor.saveState();
   // Perform operations...
   ```

2. **Selection**: Clear selection when appropriate to avoid unexpected behavior:
   ```javascript
   editor.selectionManager.clearSelection();
   ```

3. **Error Handling**: Check operation results for errors:
   ```javascript
   const result = someOperation();
   if (result.error) {
       // Handle error
   }
   ```

4. **Performance**: For large molecules, consider batching operations and using the LabelRenderer for optimized label updates.

## API Reference

For complete API documentation, see the [API Reference](index.html) which includes detailed information about all classes, methods, and properties.