import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Match the webview's ESM runtime instead of testing third-party CJS shims.
const output = new URL('../.test-webview/', import.meta.url);
mkdirSync(fileURLToPath(output), { recursive: true });
writeFileSync(new URL('package.json', output), '{"type":"module"}\n');
