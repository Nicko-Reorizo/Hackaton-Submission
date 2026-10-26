import { join } from 'node:path';
import { npm, root } from './run.mjs';

try {
  for (const [directory, script] of [['backend', 'test'], ['mobile', 'test'], ['mobile', 'typecheck'], ['dashboard', 'build']]) {
    console.log(`Checking ${directory}...`);
    await npm(['run', script], join(root, directory));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
