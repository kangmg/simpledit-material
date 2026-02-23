# Contributing to Simpledit

Thank you for your interest in contributing to Simpledit! This guide will help you get started with development.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Coding Standards](#coding-standards)
- [Adding Features](#adding-features)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/kangmg/simpledit.git
cd simpledit

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Development Branch

Work on the `refactor_editor_split` branch for refactoring tasks, or create feature branches from `main`.

## Project Structure

```
simpledit/
├── src/
│   ├── main.js                  # Entry point
│   ├── editor.js                # Core orchestrator
│   ├── editorState.js          # Centralized state
│   ├── managers/               # Manager classes
│   │   ├── selectionManager.js
│   │   ├── uiManager.js
│   │   ├── fileIOManager.js
│   │   ├── renderManager.js
│   │   └── geometryController.js
│   ├── utils/                  # Utility classes
│   │   ├── errorHandler.js
│   │   ├── labelRenderer.js
│   │   └── objectPool.js
│   ├── constants.js            # Element data, constants
│   ├── geometryEngine.js       # Pure geometry math
│   └── ...
├── tests/                      # Test files (XYZ format)
├── docs/                       # Documentation
│   └── architecture.md
├── index.html
├── style.css
├── tutorial.html
└── vite.config.js
```

## Architecture

See [architecture.md](./architecture.md) for a comprehensive overview.

### Key Principles

1. **Separation of Concerns**: Each manager handles a specific responsibility
2. **Centralized State**: EditorState manages all UI and selection state
3. **Pure Functions**: GeometryEngine contains stateless calculations
4. **Error Handling**: Use ErrorHandler for consistent responses
5. **Performance**: Utilize dirty checking and object pooling

### Manager Classes

- **SelectionManager**: Atom selection logic and visual highlights
- **UIManager**: UI interactions, modals, labels, and export
- **FileIOManager**: XYZ file import/export
- **RenderManager**: 3D mesh creation and scene management
- **GeometryController**: Geometry manipulation (bond/angle/dihedral)

## Coding Standards

### Code Style

- **Indentation**: 4 spaces
- **Semicolons**: Optional (project uses them inconsistently)
- **Quotes**: Single quotes preferred
- **Line Length**: Max 120 characters

### Naming Conventions

- **Classes**: PascalCase (`EditorState`, `SelectionManager`)
- **Functions/Methods**: camelCase (`addAtom`, `setBondLength`)
- **Constants**: UPPER_SNAKE_CASE (`UI_CONSTANTS`, `DEFAULT_ELEMENT`)
- **Private**: Prefix with underscore `_privateMethod` (by convention)

### Error Handling

Always use `ErrorHandler` for consistent responses:

```javascript
import { ErrorHandler } from './utils/errorHandler.js';

// Return errors
if (invalid) {
    return ErrorHandler.error('Invalid input');
}

// Return success
return ErrorHandler.success('Operation completed', resultData);

// Validation helpers
const error = ErrorHandler.validatePositive(value, 'distance');
if (error) return error;
```

### State Management

Use `EditorState` for all UI and selection state:

```javascript
// Good
this.state.setMode('edit');
this.state.setLabelMode('symbol');
this.state.selection.order.push(atom);

// Avoid (unless using compatibility layer)
this.mode = 'edit'; // This works via getter/setter but prefer state
```

### Performance

- Use `LabelRenderer` for label updates (dirty checking + RAF)
- Use `Vector3Pool` for temporary vectors in calculations
- Avoid creating new objects in loops

## Adding Features

### Adding a New Command

1. Register in `commandRegistry.js`:
```javascript
this.register('mycommand', ['mc'], 'mycommand <args>', (args) => {
    // Command logic
    return { success: 'Command executed' };
});
```

2. Add help text with proper format
3. Update `usage.md` documentation
4. Create a test file in `tests/`

### Adding a New Manager Method

1. Add method to appropriate manager class
2. Use ErrorHandler for responses
3. Update EditorState if needed
4. Document with JSDoc comments (optional but recommended)

Example:
```javascript
/**
 * My new method
 * @param {number} value - Input value
 * @returns {Object} Result object
 */
myMethod(value) {
    const validation = ErrorHandler.validateNumber(value, 'value');
    if (validation) return validation;
    
    // Logic here
    
    return ErrorHandler.success('Completed');
}
```

### Adding UI Elements

1. Add HTML to `index.html`
2. Add styles to `style.css`
3. Bind events in `UIManager.bindToolbarEvents()` or similar
4. Update UI state in `EditorState` if applicable

## Testing

### Manual Testing

Use the test files in `tests/` directory:

```bash
# In browser console
> load tests/01_basic_commands.txt
```

Test files cover:
- Basic commands (add, delete, select)
- Geometry manipulation
- Molecule management
- Coordinate transformations
- And more...

### Automated Testing (Future)

Currently no automated tests. Contributions for test infrastructure welcome!

## Pull Request Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**
   - Follow coding standards
   - Keep commits atomic and well-described
   - Update documentation if needed

3. **Test Your Changes**
   - Run the app locally
   - Test relevant features manually
   - Check browser console for errors

4. **Commit**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

   Commit message format:
   - `feat:` new feature
   - `fix:` bug fix
   - `refactor:` code refactoring
   - `docs:` documentation update
   - `style:` formatting changes
   - `test:` adding tests

5. **Push and Create PR**
   ```bash
   git push origin feature/my-feature
   ```
   
   Then create a pull request on GitHub

6. **PR Review**
   - Address review comments
   - Keep PR focused on one thing
   - Update PR description if scope changes

## Code Review Checklist

Before submitting a PR, verify:

- [ ] Code follows project style
- [ ] No console errors in browser
- [ ] Error handling uses ErrorHandler
- [ ] State changes go through EditorState
- [ ] Documentation updated if needed
- [ ] Commit messages are descriptive
- [ ] No breaking changes (or documented if unavoidable)

## Common Tasks

### Adding a New Element Property

1. Update `ELEMENTS` in `constants.js`
2. Update render logic in `RenderManager` if visual changes needed

### Changing State Structure

1. Update `EditorState.js`
2. Update compatibility layer getters/setters in `editor.js` if needed
3. Test all features that use the state

### Optimizing Performance

1. Identify bottleneck (browser profiler)
2. Consider:
   - Dirty checking
   - Object pooling
   - RAF batching
   - Memoization
3. Test with large molecules

## Getting Help

- Check `docs/architecture.md` for system overview
- Read `tutorial.html` for command reference
- Look at existing code for patterns
- Open an issue for questions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## Thank You!

Your contributions make Simpledit better for everyone. Thank you for your time and effort!
