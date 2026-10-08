// Run only after an explicitly requested local factory reset; ordinary restarts preserve browser storage.
import {writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
for(const role of ['sender','receiver'])await writeFile(`/${role}-companion/browser-reset.json`,JSON.stringify({generation:randomBytes(16).toString('hex'),requestedAt:new Date().toISOString()}),{mode:0o600});
console.log('One-time browser storage reset prepared for both Hauntboard clients.');
