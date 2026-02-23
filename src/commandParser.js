import * as THREE from 'three';

export class CommandParser {
    parse(input) {
        const trimmed = input.trim();
        if (!trimmed) return null;

        // Regex to match:
        // 1. Quoted strings (double or single quotes)
        // 2. Non-whitespace sequences
        const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;

        const tokens = [];
        let match;

        while ((match = regex.exec(trimmed)) !== null) {
            // match[1] is double quoted content
            // match[2] is single quoted content
            // match[3] is unquoted word
            tokens.push(match[1] || match[2] || match[3]);
        }

        if (tokens.length === 0) return null;

        return {
            command: tokens[0].toLowerCase(),
            args: tokens.slice(1)
        };
    }
}
