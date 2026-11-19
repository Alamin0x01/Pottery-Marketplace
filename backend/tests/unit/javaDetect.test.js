import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJavaMajor, resolveJava, MIN_JAVA, JAVA_HELP } from '../../scripts/lib/java.js';

test('parses the major version from every common `java -version` format', () => {
  assert.equal(parseJavaMajor('openjdk version "21.0.13" 2026-10-20 LTS\nOpenJDK Runtime Environment'), 21);
  assert.equal(parseJavaMajor('java version "17.0.9" 2023-10-17 LTS'), 17);
  assert.equal(parseJavaMajor('openjdk version "25" 2025-09-16'), 25);
  assert.equal(parseJavaMajor('java version "1.8.0_392"'), 8);
  for (const bad of ['', null, undefined, 'command not found', 'version without quotes 21']) assert.equal(parseJavaMajor(bad), null);
});

test('resolveJava returns null (never throws) when no Java can be found', () => {
  const empty = mkdtempSync(join(tmpdir(), 'nojava-'));
  const env = { PATH: empty, Path: empty, JAVA_HOME: join(empty, 'missing') };
  assert.equal(resolveJava({ env, toolsDir: join(empty, '.tools') }), null);
});

test('a directory without a working java binary is ignored, not trusted', () => {
  const tools = mkdtempSync(join(tmpdir(), 'tools-'));
  mkdirSync(join(tools, 'jdk', 'fake-jdk', 'bin'), { recursive: true });
  writeFileSync(join(tools, 'jdk', 'fake-jdk', 'bin', 'java.exe'), 'not a real executable');
  const env = { PATH: tools, Path: tools };
  assert.equal(resolveJava({ env, toolsDir: tools }), null);
});

test('the help message tells the user exactly what to do', () => {
  assert.match(JAVA_HELP, new RegExp(`Java ${MIN_JAVA}`));
  assert.match(JAVA_HELP, /winget install EclipseAdoptium\.Temurin\.21\.JDK/);
  assert.match(JAVA_HELP, /JAVA_HOME/);
});
