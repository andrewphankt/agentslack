#!/usr/bin/env node
// Signs the script every connected project runs (apps/web/lib/roomCore.ts).
//
//   node scripts/sign-room-core.mjs          sign with the key on this computer
//   node scripts/sign-room-core.mjs --init   make the key first if there is none
//   node scripts/sign-room-core.mjs --check  only check that the saved signature still matches
//
// The private key stays on the signer's computer (~/.config/mesh/room-signing.pem). It is never
// committed and never put on the server, so breaking into the server is not enough to publish a
// script: connected projects only accept one that this key signed.
import { createSign, createVerify, generateKeyPairSync, createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreFile = join(root, "apps/web/lib/roomCore.ts");
const sigFile = join(root, "apps/web/lib/roomCoreSig.ts");
const keyFile = join(homedir(), ".config/mesh/room-signing.pem");

function coreText() {
  const src = readFileSync(coreFile, "utf8");
  const a = src.indexOf("String.raw`") + "String.raw`".length;
  const b = src.lastIndexOf("`;");
  if (a < 11 || b < a) throw new Error("Could not find the script inside roomCore.ts");
  return src.slice(a, b);
}

if (process.argv.includes("--check")) {
  const saved = readFileSync(sigFile, "utf8");
  const sig = /ROOM_CORE_SIG = "([^"]+)"/.exec(saved)?.[1];
  const pub = /ROOM_PUBLIC_KEY = `([^`]+)`/.exec(saved)?.[1];
  const ok = !!sig && !!pub && createVerify("RSA-SHA256").update(coreText()).verify(pub, sig, "base64");
  console.log(ok ? "Signature matches." : "Signature is STALE. Run: node scripts/sign-room-core.mjs");
  process.exit(ok ? 0 : 1);
}

if (!existsSync(keyFile)) {
  if (!process.argv.includes("--init")) {
    console.error(`No signing key at ${keyFile}. Run with --init to make one.`);
    process.exit(1);
  }
  mkdirSync(dirname(keyFile), { recursive: true, mode: 0o700 });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`Made a signing key at ${keyFile}. Keep a backup somewhere safe.`);
}

const key = readFileSync(keyFile, "utf8");
const pub = createPublicKey(key).export({ type: "spki", format: "pem" }).toString().trim();
const sig = createSign("RSA-SHA256").update(coreText()).sign(key, "base64");
writeFileSync(
  sigFile,
  `/** Written by scripts/sign-room-core.mjs. Do not edit by hand; run it again after changing roomCore.ts. */
export const ROOM_CORE_SIG = "${sig}";
/** The public half of the signing key. Safe to share: it can only check a signature, not make one. */
export const ROOM_PUBLIC_KEY = \`${pub}\`;
`,
);
console.log("Signed.");
