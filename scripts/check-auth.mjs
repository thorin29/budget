#!/usr/bin/env node
/**
 * Fails the build if anything callable from outside can run without checking
 * its caller.
 *
 * 1. Server actions. Every export of a "use server" file is callable by its id,
 *    whatever page it was written for, so each one must call requireUser() —
 *    directly, or through the file's `run` helper when that helper does —
 *    unless it is on PUBLIC_ACTIONS.
 * 2. /api/v1 routes. Every exported handler must call requireDevice() unless
 *    the route is on PUBLIC_API. This is the one path the outer proxy lets
 *    through, so a route that forgets is open to the internet.
 * 3. Other route handlers (outside /api) must call requireUser(), unless on
 *    PUBLIC_OTHER.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PUBLIC_ACTIONS = new Set([
  "signInAction", // signing in
  "signOutAction", // only ever removes this browser's cookie
  "createFirstAccountAction", // first run; guarded by the setup code in the log
  "joinAction", // second account; guarded by a one-time invite code
]);

const PUBLIC_API = new Set([
  "meta", // version only, read before signing in
  "auth/login", // password → five-minute proof; rate limited
  "auth/enroll", // proof + one-time code → token; rate limited
]);

const PUBLIC_OTHER = new Set([
  "api/health", // container health check; status only
]);

const root = new URL("..", import.meta.url).pathname;
const app = join(root, "src", "app");
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
let actions = 0;
let routes = 0;

const handlers = (text) => {
  const found = [...text.matchAll(/^export async function (\w+)\s*\(/gm)];
  return found.map((m, i) => ({ name: m[1], body: text.slice(m.index, found[i + 1]?.index ?? text.length) }));
};

for (const file of files(src)) {
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file);

  // ---- server actions
  if (/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(text)) {
    const runGuarded = /async function run\([\s\S]*?\n}\n/.exec(text)?.[0]?.includes("requireUser(") ?? false;
    for (const m of text.matchAll(/^export\s+(?!async function|type |interface )(\w+)/gm)) {
      problems.push(`${rel}: exports "${m[1]}", which is not an async function`);
    }
    for (const { name, body } of handlers(text)) {
      actions += 1;
      if (PUBLIC_ACTIONS.has(name) || body.includes("requireUser(")) continue;
      if (runGuarded && /\brun\(/.test(body)) continue;
      problems.push(`${rel}: action ${name} never calls requireUser()`);
    }
    continue;
  }

  // ---- route handlers
  if (!file.endsWith(`${sep}route.ts`) || !file.startsWith(app)) continue;
  const routePath = relative(app, file).split(sep).slice(0, -1).join("/");
  const isApi = routePath === "api/v1" || routePath.startsWith("api/v1/");
  const apiPath = routePath.replace(/^api\/v1\/?/, "");

  for (const { name, body } of handlers(text)) {
    if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) continue;
    routes += 1;
    if (isApi) {
      if (PUBLIC_API.has(apiPath) || body.includes("requireDevice(")) continue;
      problems.push(`${rel}: ${name} never calls requireDevice()`);
    } else {
      if (PUBLIC_OTHER.has(routePath) || body.includes("requireUser(")) continue;
      problems.push(`${rel}: ${name} never calls requireUser()`);
    }
  }
}

if (problems.length) {
  console.error("Unguarded entry points:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`check-auth: ${actions} server actions and ${routes} route handlers, all guarded or on the public list.`);
