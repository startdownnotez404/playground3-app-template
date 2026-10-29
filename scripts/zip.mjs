#!/usr/bin/env node
/**
 * `npm run zip` — pack exactly the files Author keeps (same extension
 * allowlist and skipped dirs) into <id>.zip, ready for Author → Load zip.
 * No dependencies: stored/deflated entries via node:zlib.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { listAppFiles } from "./files.mjs";
import { isKeptInZip, MAX_ZIP_BYTES, parseAppManifest } from "./rules.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = parseAppManifest(readFileSync(path.join(rootDir, "app.config.json"), "utf8"));
const outName = `${manifest.id}.zip`;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const locals = [];
const centrals = [];
let offset = 0;
const files = listAppFiles(rootDir).filter(
  (file) => isKeptInZip(file.relative) && file.relative !== outName
);
for (const file of files) {
  const name = Buffer.from(file.relative, "utf8");
  const data = readFileSync(file.absolute);
  const deflated = deflateRawSync(data);
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8 names
  header.writeUInt16LE(useDeflate ? 8 : 0, 8);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  locals.push(header, name, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(useDeflate ? 8 : 0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += header.length + name.length + body.length;
}
const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralSize, 12);
eocd.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, ...centrals, eocd]);
if (zip.length > MAX_ZIP_BYTES) {
  console.error(`✗ ${outName} is ${(zip.length / 1024 / 1024).toFixed(1)} MB. Author rejects zips over 20 MB.`);
  process.exit(1);
}
writeFileSync(path.join(rootDir, outName), zip);
console.log(`✓ ${outName}: ${files.length} files, ${(zip.length / 1024).toFixed(0)} KB. Upload it in Author → Load zip.`);
