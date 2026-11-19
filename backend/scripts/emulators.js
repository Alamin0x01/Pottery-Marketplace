// Starts the Firebase emulators with the right Java, config and project, and gives clear errors.
//
//   node scripts/emulators.js start             long-running dev emulators; data PERSISTS in backend/emulator-data
//   node scripts/emulators.js exec "<command>"  start clean emulators, run <command>, shut down (used by the tests)
//
// `demo-pottery` is a demo project id: the emulators can never touch a real Firebase project.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JAVA_HELP, MIN_JAVA, resolveJava } from './lib/java.js';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = join(backendDir, '..', '.tools');
const dataDir = join(backendDir, 'emulator-data');
const firebaseCli = join(backendDir, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

const [mode, command] = process.argv.slice(2);
if (!['start', 'exec'].includes(mode) || (mode === 'exec' && !command)) {
  console.error('Usage: node scripts/emulators.js start | node scripts/emulators.js exec "<command>"');
  process.exit(2);
}

const java = resolveJava({ toolsDir });
if (!java) {
  console.error(`✖ ${JAVA_HELP}`);
  process.exit(1);
}
if (java.major < MIN_JAVA) {
  console.error(`✖ Found Java ${java.major} (${java.source}), but the emulators need Java ${MIN_JAVA}+.\n  ${JAVA_HELP}`);
  process.exit(1);
}
console.log(`Using Java ${java.major} from ${java.source}`);

const common = ['--config', 'firebase/firebase.json', '--project', 'demo-pottery', '--only', 'auth,firestore,storage'];
let args;
if (mode === 'start') {
  mkdirSync(dataDir, { recursive: true });
  // Import previous data if a previous run exported some; always export on exit (Ctrl+C) so users/data survive restarts.
  const hasData = existsSync(join(dataDir, 'firebase-export-metadata.json'));
  args = ['emulators:start', ...common, ...(hasData ? ['--import', dataDir] : []), '--export-on-exit', dataDir];
  console.log(hasData ? `Restoring emulator data from ${dataDir}` : 'No saved emulator data yet (a fresh database will be created).');
  console.log('Auth emulator: http://127.0.0.1:9099 · Firestore: 127.0.0.1:8080 · Storage: 127.0.0.1:9199. Press Ctrl+C to stop (data is saved).');
} else {
  args = ['emulators:exec', ...common, command];
}

const child = spawn(process.execPath, [firebaseCli, ...args], { cwd: backendDir, env: java.env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
