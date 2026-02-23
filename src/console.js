import { CommandParser } from './commandParser.js';
import { CommandRegistry } from './commandRegistry.js';
import { UI_CONSTANTS } from './constants.js';

export class Console {
    constructor(editor) {
        this.editor = editor;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.commandRegistry = new CommandRegistry(editor);
        this.parser = new CommandParser();

        this.panel = document.getElementById('console-panel');
        this.output = document.getElementById('console-output');
        this.input = document.getElementById('console-input');
        this.prompt = document.getElementById('console-prompt');
        this.closeBtn = document.getElementById('console-close');

        this.inputMode = false;
        this.inputCallback = null;

        this.bindEvents();
        this.print('Console initialized. Type "help" for commands.', 'info');

        // Drag and Resize State
        this.isDragging = false;
        this.isResizing = false;
        this.dragStart = { x: 0, y: 0 };
        this.panelStart = { left: 0, top: 0, width: 0, height: 0 };
        this.resizeDir = '';

        this.setupInteractions();
    }

    setupInteractions() {
        const header = this.panel.querySelector('.console-header');
        const handles = this.panel.querySelectorAll('.resize-handle');

        // Drag Start
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.console-close')) return; // Ignore close button
            this.startDrag(e);
        });

        // Resize Start
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Prevent drag
                const classes = handle.className.split(' ');
                const dir = classes.find(c => ['n', 's', 'e', 'w', 'ne', 'se', 'sw', 'nw'].includes(c));
                this.startResize(e, dir);
            });
        });

        // Global Move/Up
        window.addEventListener('mousemove', (e) => this.onMove(e));
        window.addEventListener('mouseup', () => this.onUp());
    }

    convertToAbsolute() {
        const rect = this.panel.getBoundingClientRect();
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
        this.panel.style.left = rect.left + 'px';
        this.panel.style.top = rect.top + 'px';
        this.panel.style.width = rect.width + 'px';
        this.panel.style.height = rect.height + 'px';
    }

    startDrag(e) {
        this.isDragging = true;
        this.panel.classList.add('dragging');
        this.convertToAbsolute();

        this.dragStart = { x: e.clientX, y: e.clientY };
        const rect = this.panel.getBoundingClientRect();
        this.panelStart = { left: rect.left, top: rect.top };
    }

    startResize(e, dir) {
        this.isResizing = true;
        this.resizeDir = dir;
        this.panel.classList.add('resizing');
        this.convertToAbsolute();

        this.dragStart = { x: e.clientX, y: e.clientY };
        const rect = this.panel.getBoundingClientRect();
        this.panelStart = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
    }

    onMove(e) {
        if (this.isDragging) {
            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;
            this.panel.style.left = (this.panelStart.left + dx) + 'px';
            this.panel.style.top = (this.panelStart.top + dy) + 'px';
        } else if (this.isResizing) {
            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;
            const start = this.panelStart;
            let newWidth = start.width;
            let newHeight = start.height;
            let newLeft = start.left;
            let newTop = start.top;

            // Horizontal
            if (this.resizeDir.includes('e')) {
                newWidth = start.width + dx;
            } else if (this.resizeDir.includes('w')) {
                newWidth = start.width - dx;
                newLeft = start.left + dx;
            }

            // Vertical
            if (this.resizeDir.includes('s')) {
                newHeight = start.height + dy;
            } else if (this.resizeDir.includes('n')) {
                newHeight = start.height - dy;
                newTop = start.top + dy;
            }

            // Constraints (min size)
            if (newWidth >= UI_CONSTANTS.MIN_CONSOLE_WIDTH) {
                this.panel.style.width = newWidth + 'px';
                this.panel.style.left = newLeft + 'px';
            }
            if (newHeight >= UI_CONSTANTS.MIN_CONSOLE_HEIGHT) {
                this.panel.style.height = newHeight + 'px';
                this.panel.style.top = newTop + 'px';
            }
        }
    }

    onUp() {
        if (this.isDragging || this.isResizing) {
            this.isDragging = false;
            this.isResizing = false;
            this.panel.classList.remove('dragging', 'resizing');
        }
    }

    bindEvents() {
        // Input handling
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Allow new line
                    return;
                }
                e.preventDefault();

                if (this.inputMode) {
                    this.handleInput();
                } else {
                    this.handleCommand();
                }
            } else if (e.key === 'ArrowUp') {
                if (!this.inputMode) {
                    e.preventDefault();
                    this.navigateHistory(-1);
                }
            } else if (e.key === 'ArrowDown') {
                if (!this.inputMode) {
                    e.preventDefault();
                    this.navigateHistory(1);
                }
            }
        });

        // Auto-resize textarea
        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = this.input.scrollHeight + 'px';
        });

        // Close/Minimize button
        this.closeBtn.addEventListener('click', () => this.toggle());
        document.getElementById('console-minimize').addEventListener('click', () => this.toggle());

        // Maximize button
        document.getElementById('console-maximize').addEventListener('click', () => this.maximize());
    }

    toggle() {
        this.panel.classList.toggle('open');
        if (this.panel.classList.contains('open')) {
            this.input.focus();
        } else {
            // Closing - reset inline styles to allow CSS transitions or default state
            this.panel.style.left = '';
            this.panel.style.top = '';
            this.panel.style.width = '';
            this.panel.style.height = '';
            this.panel.style.right = '';
            this.panel.style.bottom = '';
            this.panel.classList.remove('maximized'); // Reset maximize state
        }
    }

    maximize() {
        this.panel.classList.toggle('maximized');
        if (this.panel.classList.contains('maximized')) {
            // Store previous state if needed, but for now just overwrite styles
            this.panel.style.left = '10px';
            this.panel.style.top = '10px';
            this.panel.style.width = 'calc(100% - 20px)';
            this.panel.style.height = 'calc(100% - 20px)';
            this.panel.style.right = 'auto';
            this.panel.style.bottom = 'auto';
        } else {
            // Restore to default or previous drag state?
            // For simplicity, restore to default "open" state (reset inline styles)
            // Or ideally, restore to pre-maximize state.
            // Let's reset to default open state for now.
            this.panel.style.left = '';
            this.panel.style.top = '';
            this.panel.style.width = '';
            this.panel.style.height = '';
            this.panel.style.right = '';
            this.panel.style.bottom = '';
        }
    }

    startInputMode(promptText, callback) {
        this.inputMode = true;
        this.inputCallback = callback;
        this.prompt.innerText = promptText;
        this.input.value = '';
        this.input.focus();
        this.print(`Enter data for ${promptText.replace('> ', '')}. Press Enter to submit, Shift+Enter for new line.`, 'info');
    }

    endInputMode() {
        this.inputMode = false;
        this.inputCallback = null;
        this.prompt.innerText = '>';
        this.input.value = '';
        this.input.style.height = 'auto';
    }

    handleInput() {
        const data = this.input.value; // Keep raw data including newlines
        if (!data.trim()) return;

        this.print(data, 'input-data'); // Echo input

        if (this.inputCallback) {
            this.inputCallback(data);
        }

        this.endInputMode();
    }

    async handleCommand() {
        const rawInput = this.input.value.trim();
        if (!rawInput) {
            this.input.value = ''; // Clear newlines if any
            this.input.style.height = 'auto';
            return;
        }

        // Clear input immediately so output is visible
        this.input.value = '';
        this.input.style.height = 'auto';

        // Add to history
        this.commandHistory.push(rawInput);
        this.historyIndex = this.commandHistory.length;

        // Parse and process heredoc syntax
        const processedCommands = this.parseHeredoc(rawInput);

        // Execute each command sequentially, showing each with its result
        for (const { command: commandString, heredocData } of processedCommands) {
            // Display this command's prompt
            this.print(`> ${commandString}`, 'prompt');

            // If heredoc data exists, show it
            if (heredocData) {
                this.print(heredocData, 'input-data');
            }

            await this.execute(commandString, heredocData);
        }
    }

    async execute(commandString, heredocData = null) {
        // Parse and execute
        const parsed = this.parser.parse(commandString);
        if (!parsed) return;

        const command = this.commandRegistry.get(parsed.command);
        if (!command) {
            this.print(`Command '${parsed.command}' not found.`, 'error');
            return;
        }

        try {
            // If heredoc data exists, pass it via special __heredoc__ arg
            if (heredocData) {
                parsed.args.push('__heredoc__', heredocData);
            }

            // Auto-save state for destructive commands
            if (command.isDestructive) {
                this.editor.saveState();
            }

            // Await the command execution to support async commands like 'time'
            const result = await command.execute(parsed.args);

            if (result) {
                // Check if result has a type property (e.g., 'image')
                const displayType = result.type || 'info';

                if (result.success) this.print(result.success, displayType === 'image' ? displayType : 'success');
                if (result.error) this.print(result.error, 'error');
                if (result.warning) this.print(result.warning, 'warning');
                if (result.info) this.print(result.info, displayType === 'image' ? 'image' : 'info');
            }
        } catch (error) {
            this.print(`Error executing '${commandString}': ${error.message}`, 'error');
            console.error(error);
        }
    }

    parseHeredoc(input) {
        // Replace backslashes with newlines first
        const normalized = input.replace(/\s*\\\s*/g, '\n');
        const lines = normalized.split('\n');

        const result = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();

            // Skip comments and empty lines
            if (!line || line.startsWith('#')) {
                i++;
                continue;
            }

            // Check for heredoc syntax: command <<DELIMITER
            const heredocMatch = line.match(/^(.+?)\s*<<\s*(\S+)$/);

            if (heredocMatch) {
                const [, commandPart, delimiter] = heredocMatch;
                const heredocLines = [];
                i++; // Move to next line

                // Collect lines until delimiter
                while (i < lines.length) {
                    const currentLine = lines[i];
                    if (currentLine.trim() === delimiter) {
                        i++; // Skip delimiter line
                        break;
                    }
                    heredocLines.push(currentLine);
                    i++;
                }

                result.push({
                    command: commandPart.trim(),
                    heredocData: heredocLines.join('\n')
                });
            } else {
                // Regular command
                result.push({
                    command: line,
                    heredocData: null
                });
                i++;
            }
        }

        return result;
    }

    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;

        this.historyIndex += direction;

        if (this.historyIndex < 0) {
            this.historyIndex = 0;
        } else if (this.historyIndex >= this.commandHistory.length) {
            this.historyIndex = this.commandHistory.length;
            this.input.value = '';
            return;
        }

        this.input.value = this.commandHistory[this.historyIndex] || '';
    }

    print(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;

        if (type === 'image') {
            // Display image from data URL
            const img = document.createElement('img');
            img.src = message;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.border = '1px solid #333';
            img.style.borderRadius = '4px';
            img.style.marginTop = '8px';
            line.appendChild(img);
        } else {
            // Preserve line breaks and spaces for text
            line.style.whiteSpace = 'pre-wrap';
            line.textContent = message;
        }

        this.output.appendChild(line);

        // Auto-scroll to bottom
        this.output.scrollTop = this.output.scrollHeight;
    }

    clear() {
        this.output.innerHTML = '';
    }
}
