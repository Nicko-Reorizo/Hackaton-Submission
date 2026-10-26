import { join } from 'node:path';
import { npm, root } from './run.mjs';

try {
  for (const directory of ['backend', 'mobile', 'dashboard']) {
    console.log(`Installing ${directory} dependencies...`);
    await npm([process.argv.includes('--ci') ? 'ci' : 'install'], join(root, directory));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
