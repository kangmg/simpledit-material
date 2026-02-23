import { Crystal, LatticeParams } from '../crystal.js';
import { ELEMENTS } from '../constants.js';

/**
 * Parser and generator for CIF (Crystallographic Information File) format.
 * Supports CIF1 (text key-value + loop_ blocks).
 *
 * Handles:
 *  - Cell parameters (_cell_length_*, _cell_angle_*)
 *  - Space-group metadata
 *  - Symmetry operations (_symmetry_equiv_pos_as_xyz or _space_group_symop_operation_xyz)
 *  - Atom sites with fractional coordinates (_atom_site loop_)
 *  - Automatic application of symmetry-equivalent positions
 */
export class CIFParser {
    /**
     * Parse CIF text and return a Crystal object.
     * Uses the first data_ block found.
     * @param {string} content
     * @returns {Crystal}
     */
    static parse(content) {
        const blocks = this._splitDataBlocks(content);
        if (blocks.length === 0) throw new Error('No data_ block found in CIF file');
        return this._parseBlock(blocks[0]);
    }

    // ─── Internal: split into data blocks ────────────────────────────────────

    static _splitDataBlocks(content) {
        const blocks = [];
        let cur = null;
        for (const line of content.split('\n')) {
            const m = line.match(/^data_(\S*)/i);
            if (m) {
                if (cur) blocks.push(cur);
                cur = { name: m[1] || 'structure', lines: [] };
            } else if (cur) {
                cur.lines.push(line);
            }
        }
        if (cur) blocks.push(cur);
        return blocks;
    }

    // ─── Internal: parse one data block ──────────────────────────────────────

    static _parseBlock(block) {
        // Step 1: tokenise the block
        const tokens = this._tokenize(block.lines);

        // Step 2: extract key-value pairs and loop_ sections
        const kv = {};
        const loops = [];
        this._lex(tokens, kv, loops);

        // ── Cell parameters ──────────────────────────────────────────────────
        const getNum = (key, def = 0) => {
            const v = kv[key.toLowerCase()];
            if (!v) return def;
            // Strip uncertainty in parentheses, e.g. "5.640(2)"
            return parseFloat(v.replace(/\(.*?\)/, '')) || def;
        };

        const lattice = new LatticeParams(
            getNum('_cell_length_a', 5),
            getNum('_cell_length_b', 5),
            getNum('_cell_length_c', 5),
            getNum('_cell_angle_alpha', 90),
            getNum('_cell_angle_beta',  90),
            getNum('_cell_angle_gamma', 90)
        );

        const crystal = new Crystal(block.name || 'Structure');
        crystal.setLattice(lattice);

        // ── Space group metadata ─────────────────────────────────────────────
        crystal.spaceGroup = (
            kv['_symmetry_space_group_name_h-m'] ||
            kv['_space_group_name_h-m_alt']      ||
            kv['_symmetry_space_group_name_h_m_alt'] ||
            null
        );
        crystal.spaceGroupNumber = parseInt(
            kv['_symmetry_int_tables_number'] ||
            kv['_space_group_it_number'] ||
            '0'
        ) || null;

        // ── Symmetry operations ──────────────────────────────────────────────
        let rawSymOps = null;
        for (const loop of loops) {
            const opKey = loop.headers.find(h =>
                h.includes('equiv_pos_as_xyz') ||
                h.includes('symop_operation_xyz')
            );
            if (opKey) {
                rawSymOps = loop.rows.map(r => r[opKey]).filter(Boolean);
                break;
            }
        }
        if (!rawSymOps || rawSymOps.length === 0) rawSymOps = ['x,y,z'];
        const symOps = this._parseSymOps(rawSymOps);

        // ── Atom sites ───────────────────────────────────────────────────────
        let siteLoop = null;
        for (const loop of loops) {
            if (loop.headers.some(h => h.startsWith('_atom_site_'))) {
                siteLoop = loop;
                break;
            }
        }
        if (!siteLoop || siteLoop.rows.length === 0) {
            throw new Error('No _atom_site loop found in CIF');
        }

        const expanded = this._expandSymmetry(siteLoop.rows, symOps);
        expanded.forEach(site => {
            crystal.addAtomFractional(site.element, site.fx, site.fy, site.fz);
        });

        return crystal;
    }

    // ─── Tokeniser ────────────────────────────────────────────────────────────
    // Converts lines into a flat array of string tokens.
    // Handles: quoted strings, semicolon-delimited text blocks, inline comments.

    static _tokenize(lines) {
        const tokens = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            // Semicolon text block: starts when a line begins with ';'
            if (line.startsWith(';')) {
                i++;
                const parts = [];
                while (i < lines.length && !lines[i].startsWith(';')) {
                    parts.push(lines[i]);
                    i++;
                }
                tokens.push(parts.join('\n'));
                i++; // skip closing ';'
                continue;
            }

            // Strip inline comment (# outside quotes)
            let stripped = '';
            let inSingleQ = false, inDoubleQ = false;
            for (const ch of line) {
                if (ch === "'" && !inDoubleQ) { inSingleQ = !inSingleQ; stripped += ch; continue; }
                if (ch === '"' && !inSingleQ) { inDoubleQ = !inDoubleQ; stripped += ch; continue; }
                if (ch === '#' && !inSingleQ && !inDoubleQ) break;
                stripped += ch;
            }

            // Tokenise the stripped line
            let j = 0;
            while (j < stripped.length) {
                // Skip whitespace
                while (j < stripped.length && /\s/.test(stripped[j])) j++;
                if (j >= stripped.length) break;

                if (stripped[j] === "'" || stripped[j] === '"') {
                    const q = stripped[j++];
                    let tok = '';
                    while (j < stripped.length && stripped[j] !== q) tok += stripped[j++];
                    j++; // closing quote
                    tokens.push(tok);
                } else {
                    let tok = '';
                    while (j < stripped.length && !/\s/.test(stripped[j])) tok += stripped[j++];
                    if (tok) tokens.push(tok);
                }
            }
            i++;
        }
        return tokens;
    }

    // ─── Lexer ────────────────────────────────────────────────────────────────
    // Converts flat token stream into key-value pairs and loop_ sections.

    static _lex(tokens, kv, loops) {
        let i = 0;
        while (i < tokens.length) {
            const tok = tokens[i];
            const low = tok.toLowerCase();

            if (low === 'loop_') {
                i++;
                const headers = [];
                while (i < tokens.length && tokens[i].startsWith('_')) {
                    headers.push(tokens[i].toLowerCase());
                    i++;
                }
                const rows = [];
                while (
                    i < tokens.length &&
                    !tokens[i].toLowerCase().startsWith('loop_') &&
                    !tokens[i].startsWith('_') &&
                    !tokens[i].toLowerCase().startsWith('data_') &&
                    !tokens[i].toLowerCase().startsWith('stop_')
                ) {
                    const row = {};
                    for (let h = 0; h < headers.length; h++) {
                        row[headers[h]] = tokens[i + h] || '';
                    }
                    rows.push(row);
                    i += headers.length;
                }
                loops.push({ headers, rows });

            } else if (tok.startsWith('_')) {
                const key = tok.toLowerCase();
                i++;
                // Next token is the value (if it exists and is not a key/directive)
                if (
                    i < tokens.length &&
                    !tokens[i].startsWith('_') &&
                    tokens[i].toLowerCase() !== 'loop_' &&
                    !tokens[i].toLowerCase().startsWith('data_')
                ) {
                    kv[key] = tokens[i];
                    i++;
                } else {
                    kv[key] = '';
                }
            } else {
                // Stray token (e.g. leftover data values) — skip
                i++;
            }
        }
    }

    // ─── Symmetry operations ─────────────────────────────────────────────────

    static _parseSymOps(rawOps) {
        return rawOps.map(op => {
            // Remove leading index number (e.g. "1  x,y,z" → "x,y,z")
            const clean = op.replace(/^\d+\s+/, '').replace(/'/g, '').trim();
            const parts = clean.split(',').map(s => s.trim());
            return parts.length >= 3 ? parts : null;
        }).filter(Boolean);
    }

    /**
     * Evaluate a symmetry-operation expression such as "-x+1/2, y, -z+1/4"
     * for given fractional coordinate values.
     */
    static _evalExpr(expr, x, y, z) {
        // Replace integer fractions first, then substitute variables
        let e = expr
            .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => String(Number(a) / Number(b)))
            .replace(/\bx\b/gi, `(${x})`)
            .replace(/\by\b/gi, `(${y})`)
            .replace(/\bz\b/gi, `(${z})`);
        try {
            // eslint-disable-next-line no-new-func
            return Function('"use strict";return(' + e + ')')();
        } catch {
            return 0;
        }
    }

    // ─── Symmetry expansion ───────────────────────────────────────────────────

    static _expandSymmetry(rows, symOps) {
        const result = [];
        const EPS = 1e-4;
        const wrap = v => ((v % 1) + 1) % 1;

        const isDup = (fx, fy, fz) => {
            const wx = wrap(fx), wy = wrap(fy), wz = wrap(fz);
            return result.some(a =>
                Math.abs(wrap(a.fx) - wx) < EPS &&
                Math.abs(wrap(a.fy) - wy) < EPS &&
                Math.abs(wrap(a.fz) - wz) < EPS
            );
        };

        rows.forEach(row => {
            const typeSymbol = row['_atom_site_type_symbol'] || row['_atom_site_label'] || 'X';
            const element = this._extractElement(typeSymbol);

            // Handle '.' (absent) and '?' (unknown) as 0
            const parseCoord = s => {
                if (!s || s === '.' || s === '?') return 0;
                return parseFloat(s.replace(/\(.*?\)/, '')) || 0;
            };

            const fx0 = parseCoord(row['_atom_site_fract_x']);
            const fy0 = parseCoord(row['_atom_site_fract_y']);
            const fz0 = parseCoord(row['_atom_site_fract_z']);

            // Skip if occupancy is 0
            const occ = row['_atom_site_occupancy'];
            if (occ && parseFloat(occ) < 1e-6) return;

            for (const op of symOps) {
                const fx = this._evalExpr(op[0], fx0, fy0, fz0);
                const fy = this._evalExpr(op[1], fx0, fy0, fz0);
                const fz = this._evalExpr(op[2], fx0, fy0, fz0);

                if (!isDup(fx, fy, fz)) {
                    result.push({ element, fx: wrap(fx), fy: wrap(fy), fz: wrap(fz) });
                }
            }
        });

        return result;
    }

    static _extractElement(label) {
        if (!label || label === '.' || label === '?') return 'X';
        // Try 2-char then 1-char element symbol
        const m = label.match(/^([A-Z][a-z]?)/);
        if (m) {
            const sym = m[1];
            if (ELEMENTS[sym]) return sym;
            // fall through to single-char attempt
        }
        const two = label.substring(0, 2);
        if (ELEMENTS[two]) return two;
        const one = label.substring(0, 1).toUpperCase();
        if (ELEMENTS[one]) return one;
        return 'X';
    }

    // ─── Generator ────────────────────────────────────────────────────────────

    /**
     * Generate CIF text from a Crystal object.
     * Only the identity symmetry operation is written (P1 description).
     * @param {Crystal} crystal
     * @param {string} [name] Data block name (defaults to crystal.name)
     * @returns {string}
     */
    static generate(crystal, name) {
        if (!crystal.lattice) throw new Error('Crystal has no lattice parameters');
        const blockName = (name || crystal.name || 'export').replace(/\s+/g, '_');
        const l = crystal.lattice;
        const lines = [`data_${blockName}`, ''];

        lines.push(`_cell_length_a    ${l.a.toFixed(6)}`);
        lines.push(`_cell_length_b    ${l.b.toFixed(6)}`);
        lines.push(`_cell_length_c    ${l.c.toFixed(6)}`);
        lines.push(`_cell_angle_alpha ${l.alpha.toFixed(4)}`);
        lines.push(`_cell_angle_beta  ${l.beta.toFixed(4)}`);
        lines.push(`_cell_angle_gamma ${l.gamma.toFixed(4)}`);
        lines.push('');

        if (crystal.spaceGroup) {
            lines.push(`_symmetry_space_group_name_H-M  '${crystal.spaceGroup}'`);
        }
        if (crystal.spaceGroupNumber) {
            lines.push(`_symmetry_Int_Tables_number  ${crystal.spaceGroupNumber}`);
        }
        lines.push('');

        // Identity symmetry only (P1 description)
        lines.push("loop_");
        lines.push("_symmetry_equiv_pos_as_xyz");
        lines.push("  'x, y, z'");
        lines.push('');

        lines.push('loop_');
        lines.push('_atom_site_label');
        lines.push('_atom_site_type_symbol');
        lines.push('_atom_site_fract_x');
        lines.push('_atom_site_fract_y');
        lines.push('_atom_site_fract_z');

        const elemCount = {};
        crystal.atoms.forEach(atom => {
            const cnt = (elemCount[atom.element] = (elemCount[atom.element] || 0) + 1);
            let frac = crystal.getFrac(atom);
            if (!frac) {
                const f = crystal.lattice.cartToFrac(
                    atom.position.x, atom.position.y, atom.position.z
                );
                frac = { x: f.x, y: f.y, z: f.z };
            }
            lines.push(
                `${atom.element}${cnt}  ${atom.element}  ` +
                `${frac.x.toFixed(6)}  ${frac.y.toFixed(6)}  ${frac.z.toFixed(6)}`
            );
        });

        return lines.join('\n') + '\n';
    }
}
