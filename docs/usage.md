# Simpledit Console Usage Guide

Simpledit provides a powerful command-line interface (CLI) for manipulating molecules. This guide details all available commands, their aliases, and usage examples.

## General Syntax
- **Commands**: Case-insensitive (e.g., `ADD`, `add`, `Add`).
- **Arguments**: Space-separated. Use quotes for arguments with spaces (e.g., `new "My Molecule"`).
- **Flags**: Start with `-` or `--` (e.g., `--offset 5`, `-s`).
- **Indices**: 0-based atom indices.

## Core Commands

### `help` (`h`)
Show available commands or help for a specific command.
- `help`: List all commands.
- `help <command>`: Show help for a specific command.

### `list` (`ls`, `l`)
List atoms, molecules, or fragments.
- `list`: List all atoms in the active molecule.
- `list -s`: List only selected atoms.
- `list mols`: List all molecules.
- `list frags`: List disconnected fragments.

### `add` (`a`)
Add atoms, bonds, or import data.
- `add atom <element> [x] [y] [z]`: Add an atom.
  - `add atom C 0 0 0`
  - `add atom O 1.2 0 0`
- `add bond <idx1> <idx2>`: Add a bond between two atoms.
  - `add bond 0 1`
- `add mol <format>`: Enter interactive mode to paste data (e.g., XYZ).
  - `add mol xyz`

### `del` (`delete`, `rm`, `remove`)
Delete atoms, bonds, or molecules.
- `del atom <indices>`: Delete atoms by index.
  - `del atom 0 1 5`
  - `del atom 0:5` (Range)
  - `del atom :` (Delete all atoms)
- `del bond <idx1> <idx2>`: Delete a bond.
  - `del bond 0 1`
- `del mol [index|name]` (or `mols`): Delete a molecule.
  - `del mol` (Delete active)
  - `del mol 2`
  - `del mol "Molecule 1"`

### `select` (`sel`)
Select atoms for operations.
- `select <indices>`: Select specific atoms.
  - `select 0 1 2`
  - `select 0:5`
  - `select :` (Select all)

### `clear` (`cls`)
Clear the console output.

## Geometry & Manipulation

### `set`
Set geometric properties or editor settings.
- `set dist <idx1> <idx2> <value>`: Set distance between two atoms.
- `set angle <idx1> <idx2> <idx3> <value>`: Set angle (p1-p2-p3).
- `set dihedral <idx1> <idx2> <idx3> <idx4> <value>`: Set dihedral angle.
- `set threshold <value>`: Set bond detection threshold.

### `measure` (`meas`, `info`)
Measure distances, angles, or dihedrals.
- `measure <idx1> <idx2>`: Measure distance.
- `measure <idx1> <idx2> <idx3>`: Measure angle.
- `measure <idx1> <idx2> <idx3> <idx4>`: Measure dihedral.
- `measure`: Show info for selected atoms.

### `rebond` (`rb`)
Recalculate bonds based on the current threshold.
- `rebond`

### `center` (`cen`)
Move the molecule's center of mass to the origin (0,0,0).
- `center`

### `rotate` (`rot`)
Rotate the molecule around the origin.
- `rotate <x> <y> <z>`: Rotate by degrees.
  - `rotate 90 0 0` (Rotate 90° around X-axis)

### `trans` (`tr`, `translation`)
Translate the molecule.
- `trans <x> <y> <z>`: Move by units.
  - `trans 5 0 0` (Move 5 units on X-axis)

### `set`
Set geometric properties or editor settings.
- `set dist <idx1> <idx2> <value>`: Set distance between two atoms.
- `set angle <idx1> <idx2> <idx3> <value>`: Set angle (p1-p2-p3).
- `set dihedral <idx1> <idx2> <idx3> <idx4> <value>`: Set dihedral angle.
- `set threshold <value>`: Set bond detection threshold.
- `set scale atom <value>`: Set atom visual scale.
  - `set scale atom 1.5` (Increase atom size by 1.5x)
- `set scale bond <value>`: Set bond visual scale.
  - `set scale bond 0.8` (Decrease bond thickness to 0.8x)

### `substitute` (`sub`)
Substitute atoms or groups in the molecule.
- `sub atom <index> <element>`: Change an atom's element.
  - `sub atom 0 N` (Change atom 0 to Nitrogen)
- `sub grp <target_leaving> <target_anchor> -n <source_mol> <source_leaving> <source_anchor>`: Substitute a group (Explicit mode).
  - `sub grp 1 0 -n SourceMol 1 0` (Target: leaving=1, anchor=0; Source from SourceMol: leaving=1, anchor=0)
  - Target fragment attaches to source fragment via anchor atoms
  - Leaving atoms are removed after substitution
  - Alternatively use `-i <index>` instead of `-n <name>` to specify source molecule by index (not recommended)
- `sub grp <target_anchor> -n <source_mol> <source_anchor>`: Substitute with implicit dummy atoms (Implicit mode).
  - `sub grp 0 -n SourceMol 0` (Find and remove terminal 'X' dummy atoms automatically)
  - System identifies terminal 'X' atoms connected to anchors as leaving atoms

## Debugging

### `debug_conn`
Display bond connectivity debugging information.
- `debug_conn`: Show all bonds and connectivity for each atom.
  - Useful for diagnosing bonding issues or verifying molecular structure


## Molecule Management

### `new`
Create a new empty molecule.
- `new [name]`: Create with optional name.

### `switch` (`sw`)
Switch between molecules.
- `switch <index|name>`: Switch by index or name.

### `rename` (`rn`)
Rename the active molecule.
- `rename <new_name>`

### `merge` (`mg`)
Merge another molecule into the active one.
- `merge <index|name>`

## Clipboard

### `copy` (`cp`)
Copy selected atoms to clipboard.

### `cut` (`ct`)
Cut selected atoms to clipboard.

### `paste` (`pa`)
Paste atoms from clipboard.
- `paste`: Paste at original coordinates (smart offset applied if overlapping).
- `paste --offset <val>` (or `-o`): Paste with explicit offset.

## Visualization

### `label` (`lbl`)
Control atom labels.
- `label -s` (or `--symbol`): Show symbols.
- `label -n` (or `--number`): Show indices (numbers).
- `label -a` (or `--all`): Show both.
- `label -o` (or `--off`): Clear labels.

### `camera` (`cam`)
Set camera mode.
- `camera orbit`
- `camera trackball`

### `projection` (`proj`)
Set camera projection.
- `projection persp` (or `ps`): Perspective.
- `projection ortho` (or `ot`): Orthographic.

### `capture` (`cap`)
Capture a snapshot of the viewport.
- `capture`: Capture with background.
- `capture -n` (or `--no-background`): Capture with transparent background.

## History

### `undo`
Undo the last destructive operation.
- `undo`

### `redo`
Redo the last undone operation.
- `redo`

## Utilities

### `time` (`sleep`)
Pause execution (useful in scripts).
- `time <seconds>`
