import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';

// The Firebase emulators (Firestore in particular) run on the JVM; current firebase-tools needs Java 21+.
export const MIN_JAVA = 21;

/** Major version from `java -version` output: `openjdk version "21.0.13"` -> 21, legacy `"1.8.0_392"` -> 8. */
export function parseJavaMajor(output) {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(output ?? '');
  if (!match) return null;
  const major = Number(match[1]);
  return major === 1 ? Number(match[2]) : major;
}

function probe(javaBin, env) {
  const result = spawnSync(javaBin, ['-version'], { encoding: 'utf8', env });
  if (result.error || result.status !== 0) return null;
  return parseJavaMajor(`${result.stderr}${result.stdout}`);
}

const pathKey = (env) => Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';

/**
 * Finds a usable Java, in this order: the system PATH, JAVA_HOME, then a JDK unpacked in `<toolsDir>/jdk/*`
 * (the project-local, git-ignored `.tools/` folder). Returns `{ major, source, env }` where `env` is the
 * environment to launch the emulators with (JAVA_HOME and PATH adjusted when a non-PATH Java was chosen),
 * or null when none is found.
 */
export function resolveJava({ env = process.env, toolsDir } = {}) {
  const onPath = probe('java', env);
  if (onPath) return { major: onPath, source: 'PATH', env };

  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const homes = [];
  if (env.JAVA_HOME) homes.push(env.JAVA_HOME);
  const jdkRoot = toolsDir && join(toolsDir, 'jdk');
  if (jdkRoot && existsSync(jdkRoot)) {
    for (const entry of readdirSync(jdkRoot, { withFileTypes: true })) if (entry.isDirectory()) homes.push(join(jdkRoot, entry.name));
  }

  for (const home of homes) {
    const bin = join(home, 'bin');
    const major = probe(join(bin, exe), env);
    if (major) {
      const key = pathKey(env);
      return { major, source: home, env: { ...env, JAVA_HOME: home, [key]: `${bin}${delimiter}${env[key] ?? ''}` } };
    }
  }
  return null;
}

export const JAVA_HELP = `Java ${MIN_JAVA} or newer is required to run the Firebase emulators.
  Install it (Windows, one command):   winget install EclipseAdoptium.Temurin.21.JDK
  then open a NEW terminal and run this again.
  Alternatives: set JAVA_HOME to an existing JDK ${MIN_JAVA}+, or unpack a JDK into <project>/.tools/jdk/ (git-ignored).`;
