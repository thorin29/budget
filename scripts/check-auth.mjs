#!/usr/bin/env node
/**
 * Fails the build if a server action can run without checking its caller.
 *
 * Every export of a "use server" file is callable from outside by its id,
 * whatever page it was written for, so each one must call requireUser() —
 * directly, or through the file's `run` helper when that helper does — unless
 * it is one of the few that must work signed out, listed below.
 *
 * 0.14 extends this to /api/v1 routes and device tokens.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC_ACTIONS = new Set([
  "signInAction", // signing in
  "signOutAction", // only ever removes this browser's cookie
  "createFirstAccountAction", // first run; guarded by the setup code in the log
  "joinAction", // second account; guarded by a one-time invite code
]);

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "src");

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "generated" || name === "node_modules") continue;
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}

const problems = [];
let checked = 0;

for (const file of files(src)) {
  const text = readFileSync(file, "utf8");
  if (!/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(text)) continue;

  const runGuarded = /async function run\([\s\S]*?\n}\n/.exec(text)?.[0]?.includes("requireUser(") ?? false;

  // Anything exported that is not an async function is itself a problem:
  // it would be reachable as an action too.
  for (const m of text.matchAll(/^export\s+(?!async function|type |interface )(\w+)/gm)) {
    problems.push(`${relative(root, file)}: exports "${m[1]}", which is not an async function`);
  }

  const exports = [...text.matchAll(/^export async function (\w+)\s*\(/gm)];
  exports.forEach((m, i) => {
    checked += 1;
    const name = m[1];
    const body = text.slice(m.index, exports[i + 1]?.index ?? text.length);
    if (PUBLIC_ACTIONS.has(name)) return;
    if (body.includes("requireUser(")) return;
    if (runGuarded && /\brun\(/.test(body)) return;
    problems.push(`${relative(root, file)}: ${name} never calls requireUser()`);
  });
}

if (problems.length) {
  console.error("Unguarded server actions:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`check-auth: ${checked} server actions, all guarded or on the public list.`);
