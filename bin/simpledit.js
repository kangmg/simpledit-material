#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = 0; // 0 lets OS assign a random available port
const DIST_DIR = path.resolve(__dirname, '../dist');

// Parse arguments
const args = process.argv.slice(2);
const pythonFlagIndex = args.findIndex(arg => arg === '-p' || arg === '--python');
const usePython = pythonFlagIndex !== -1;

// Remove python flag from args so it doesn't get passed as a file
if (usePython) {
    args.splice(pythonFlagIndex, 1);
}

const initialFiles = args;

// Check if dist exists
if (!fs.existsSync(DIST_DIR)) {
    console.error('Error: dist directory not found. Please run "npm run build" first.');
    process.exit(1);
}

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// Python Process Management
let pythonProcess = null;
let pythonPort = 0;

async function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

async function startPythonServer() {
    pythonPort = await findFreePort();
    console.log(`Starting Python backend on port ${pythonPort}...`);

    // Try to use 'uv' first, as requested by the user
    // We attempt to run: uv run python -m simpledit_extra.main --port <port>
    const commands = [
        { cmd: 'uv', args: ['run', 'python', '-m', 'simpledit_extra.main', '--port', pythonPort.toString()] },
        { cmd: process.platform === 'win32' ? 'python' : 'python3', args: ['-m', 'simpledit_extra.main', '--port', pythonPort.toString()] }
    ];

    let startedSuccessfully = false;

    for (const command of commands) {
        try {
            console.log(`Attempting to start backend with: ${command.cmd} ${command.args.join(' ')}`);

            // We use spawn but we need to handle the case where the command doesn't exist (ENOENT)
            // To do this robustly without crashing, we can try to spawn and listen for error

            const child = spawn(command.cmd, command.args, {
                stdio: 'inherit',
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            });

            // Create a promise that rejects if the process fails to start immediately (e.g. command not found)
            await new Promise((resolve, reject) => {
                const errorHandler = (err) => {
                    child.removeListener('exit', exitHandler);
                    reject(err);
                };

                const exitHandler = (code) => {
                    child.removeListener('error', errorHandler);
                    if (code !== null && code !== 0) {
                        // If it exited immediately with error, treat as failure
                        reject(new Error(`Process exited with code ${code}`));
                    } else {
                        // If it exited with 0, that's weird for a server, but technically "success" in starting?
                        // Actually for a server it should stay running.
                        // But for "command not found" we usually get 'error' event.
                        // If 'uv' is not found, we get ENOENT.
                    }
                };

                child.once('error', errorHandler);

                // Give it a small window to fail startup
                setTimeout(() => {
                    child.removeListener('error', errorHandler);
                    resolve();
                }, 1000);
            });

            pythonProcess = child;

            pythonProcess.on('exit', (code, signal) => {
                if (code !== 0 && code !== null) {
                    console.error(`Python process exited with code ${code}`);
                }
            });

            console.log(`Successfully started backend using ${command.cmd}`);
            startedSuccessfully = true;
            break; // Success, break loop

        } catch (err) {
            console.log(`Failed to start with ${command.cmd}: ${err.message}`);
            // Continue to next command
        }
    }

    if (!startedSuccessfully) {
        console.error('Could not start Python backend. Please ensure "uv" or "python" is installed and simpledit-extra is set up.');
        // Optionally, you might want to exit here if Python backend is critical
        // process.exit(1);
    }

    // Wait a bit for Python to start (simple delay for now, better to poll health check)
    await new Promise(resolve => setTimeout(resolve, 2000));
}

// Cleanup on exit
process.on('SIGINT', () => {
    if (pythonProcess) pythonProcess.kill();
    process.exit();
});

process.on('SIGTERM', () => {
    if (pythonProcess) pythonProcess.kill();
    process.exit();
});

// Proxy function
function proxyRequest(req, res, targetPort) {
    const options = {
        hostname: 'localhost',
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (e) => {
        console.error(`Proxy error: ${e.message}`);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway: Python backend unavailable' }));
    });

    req.pipe(proxyReq, { end: true });
}

async function main() {
    if (usePython) {
        await startPythonServer();
    }

    const server = http.createServer((req, res) => {
        // console.log(`${req.method} ${req.url}`);

        // Proxy to Python if enabled and path starts with /api/python
        if (usePython && req.url.startsWith('/api/python')) {
            proxyRequest(req, res, pythonPort);
            return;
        }

        // API Endpoints
        if (req.url === '/api/init') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                args: initialFiles,
                pythonEnabled: usePython
            }));
            return;
        }

        if (req.url === '/api/shutdown' && req.method === 'POST') {
            console.log('Shutdown signal received from client.');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'shutting down' }));

            // Graceful shutdown
            setTimeout(() => {
                if (pythonProcess) {
                    console.log('Terminating Python backend...');
                    pythonProcess.kill();
                }
                console.log('Server shutting down.');
                process.exit(0);
            }, 100); // Small delay to ensure response is sent
            return;
        }

        if (req.url === '/api/heartbeat') {
            lastHeartbeat = Date.now();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'alive' }));
            return;
        }

        if (req.url.startsWith('/api/read')) {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const filePath = url.searchParams.get('path');

            if (!filePath) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing path parameter' }));
                return;
            }

            const absolutePath = path.resolve(process.cwd(), filePath);

            // Check if file exists
            if (!fs.existsSync(absolutePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }

            try {
                const content = fs.readFileSync(absolutePath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ content }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        // Static File Serving
        // Handle base path /simpledit/
        let requestPath = req.url;
        if (requestPath.startsWith('/simpledit/')) {
            requestPath = requestPath.replace('/simpledit/', '/');
        } else if (requestPath === '/simpledit') {
            requestPath = '/';
        }

        let filePath = path.join(DIST_DIR, requestPath === '/' ? 'index.html' : requestPath);
        const extname = path.extname(filePath);
        let contentType = mimeTypes[extname] || 'application/octet-stream';

        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    // SPA Fallback: serve index.html for unknown paths (if not an API call)
                    fs.readFile(path.join(DIST_DIR, 'index.html'), (error, content) => {
                        if (error) {
                            res.writeHead(500);
                            res.end('Error loading index.html');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(content, 'utf-8');
                        }
                    });
                } else {
                    res.writeHead(500);
                    res.end(`Server Error: ${error.code}`);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    });

    // Heartbeat Logic
    let lastHeartbeat = Date.now();
    const HEARTBEAT_TIMEOUT = 5000; // 5 seconds
    const CHECK_INTERVAL = 1000; // 1 second

    // Wait for first heartbeat before enforcing timeout
    let clientConnected = false;

    const heartbeatCheck = setInterval(() => {
        if (clientConnected) {
            if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
                console.log('No heartbeat received. Shutting down...');
                if (pythonProcess) pythonProcess.kill();
                process.exit(0);
            }
        } else {
            // Check if we received the first heartbeat
            if (Date.now() - lastHeartbeat < 1000) { // Just received one
                clientConnected = true;
                console.log('Client connected. Heartbeat monitoring active.');
            }
        }
    }, CHECK_INTERVAL);

    server.listen(PORT, () => {
        const address = server.address();
        const url = `http://localhost:${address.port}/simpledit/`; // Open with base path
        console.log(`Simpledit running at ${url}`);
        console.log(`Working directory: ${process.cwd()}`);
        if (usePython) {
            console.log(`Python integration enabled (Backend: localhost:${pythonPort})`);
        }
        if (initialFiles.length > 0) {
            console.log(`Initial files: ${initialFiles.join(', ')}`);
        }

        // Open browser
        const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
        exec(`${start} ${url}`);
    });
}

main();
