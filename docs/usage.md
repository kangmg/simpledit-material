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
- `select frag <index>`: Select all atoms in a fragment.
  - `select frag 0` (Select fragment 0)
- `select element <El> [El2 ...]`: Select atoms by element.
  - `select element C` (Select all carbon atoms)
  - `select element C H` (Select all carbon and hydrogen atoms)
- `select layer <N|N:M|top|bottom>`: Select atoms by layer (z-coordinate or fractional z for crystals).
  - `select layer 0` (Select bottom layer)
  - `select layer top` (Select top layer)
  - `select layer 0:2` (Select layers 0 through 2)

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
Rotate fragments or molecules around their center.
- `rot mol <x> <y> <z>`: Rotate the entire molecule by degrees.
  - `rot mol 90 0 0` (Rotate molecule 90° around X-axis)
- `rot frag <index> <x> <y> <z>`: Rotate a fragment by degrees around its centroid.
  - `rot frag 1 90 0 0` (Rotate fragment 1 by 90° around X-axis)

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

### `mv` (`move`)
Move atoms, fragments, or molecules.
- `mv atom <index> <x> <y> <z>`: Move an atom by offset.
  - `mv atom 2 0 0 3` (Move atom 2 by (0,0,3))
- `mv frag <index> <x> <y> <z>`: Move a fragment by offset.
  - `mv frag 1 0 0 3` (Move fragment 1 by (0,0,3))
- `mv mol <x> <y> <z>`: Move the entire molecule by offset.
  - `mv mol 0 0 3` (Move molecule by (0,0,3))

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

### `show`
Show 2D or 3D visualization.
- `show 3d`: Capture 3D viewport snapshot.
  - `show 3d -n` (or `--no-background`): Capture with transparent background.
- `show 2d`: Generate 2D structure diagram (SVG).
  - `show 2d -s` (or `--split`): Show each fragment separately.
  - `show 2d -l` (or `--label`): Show atom labels.
  - `show 2d -h` (or `--hydrogen`): Show hydrogen atoms.
  - `show 2d -p` (or `--png`): Export as PNG instead of SVG.

## History

### `undo`
Undo the last destructive operation.
- `undo`

### `redo`
Redo the last undone operation.
- `redo`

## File I/O

### `read`
Read a local file (local mode only).
- `read <filename>`: Load a file from the local filesystem.
  - `read molecule.xyz`

### `run`
Execute commands from a local file (local mode only).
- `run <filename>`: Run a script file containing commands.
  - `run script.txt`

### `export` (`exp`)
Export the current molecule to various formats.
- `export xyz`: Export as XYZ format.
  - `export xyz -s` (or `--split`): Export each fragment separately.
- `export smi` (or `smiles`): Export as SMILES format.
  - `export smi -s`: Export each fragment separately.
- `export sdf` (or `mol`): Export as SDF/MOL format.
  - `export sdf -s`: Export each fragment separately.
- `export cif`: Export crystal structure as CIF format.
- `export poscar` (or `vasp`): Export crystal structure as POSCAR format.

## Chemistry Tools

### `addh` (`add_hydrogens`)
Add explicit hydrogen atoms to the molecule.
- `addh`: Add hydrogens based on valence rules.

### `optimize` (`opt`, `minimize`)
Optimize molecular geometry using force field.
- `optimize`: Optimize using default force field method.
- `optimize ff`: Optimize using force field (explicit).

## Crystal Structure Commands

### `cell`
Show or set unit cell parameters.
- `cell`: Display current cell parameters and lattice vectors.
- `cell <a> <b> <c> <alpha> <beta> <gamma>`: Set new cell parameters.
  - `cell 5.0 5.0 5.0 90 90 90` (Set cubic cell)

### `supercell` (`sc`)
Generate a supercell from the current crystal structure.
- `supercell <na> <nb> <nc>`: Generate diagonal supercell.
  - `supercell 2 2 2` (Generate 2×2×2 supercell)
- `supercell <s11> <s12> <s13> <s21> <s22> <s23> <s31> <s32> <s33>`: Generate using 3×3 transformation matrix (row-major).
  - `supercell 2 0 0 0 2 0 0 0 2` (Same as 2×2×2)

### `wrap`
Wrap atoms into the unit cell [0,1) fractional coordinates.
- `wrap`: Wrap all atoms into the primary unit cell.

### `autobond` (`ab`)
Auto-detect and create bonds (PBC-aware for crystals).
- `autobond`: Use default threshold (1.1).
- `autobond <threshold>`: Use custom threshold multiplier.
  - `autobond 1.2` (Use 1.2× covalent radii)

### `ghost`
Toggle periodic image (ghost) atoms visualization.
- `ghost`: Toggle ghost atoms on/off.
- `ghost on`: Show ghost atoms.
- `ghost off`: Hide ghost atoms.

### `unitcell` (`uc`)
Toggle unit cell wireframe visualization.
- `unitcell`: Toggle unit cell on/off.
- `unitcell on`: Show unit cell.
- `unitcell off`: Hide unit cell.

### `slab`
Generate a surface slab from a crystal structure.
- `slab <h> <k> <l> [layers] [vacuum] [-no-center]`: Generate slab with Miller indices.
  - `slab 0 0 1`: Generate (001) slab with default settings (4 layers, 10 Å vacuum).
  - `slab 1 1 0 6 15`: Generate (110) slab with 6 layers and 15 Å vacuum.
  - `slab 1 0 0 4 10 -no-center`: Generate (100) slab without centering.

### `poly` (`polyhedra`)
Toggle coordination polyhedra visualization.
- `poly`: Toggle polyhedra on/off for all elements with CN≥3.
- `poly on`: Show polyhedra.
- `poly off`: Hide polyhedra.
- `poly on <element> [element2 ...]`: Show polyhedra only for specific elements.
  - `poly on Ti O` (Show polyhedra for Ti and O atoms)

### `bonds`
Toggle bond visibility.
- `bonds`: Toggle bonds on/off.
- `bonds on`: Show bonds.
- `bonds off`: Hide bonds.

## Utilities

### `time` (`sleep`)
Pause execution (useful in scripts).
- `time <seconds>`
