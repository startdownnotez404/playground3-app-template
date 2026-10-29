import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ZIP_SKIP_DIR_NAMES } from "./rules.mjs";

/** Every file under rootDir (posix-relative), skipping the dirs Author skips. */
export const listAppFiles = (rootDir) => {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ZIP_SKIP_DIR_NAMES.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      out.push({
        relative: path.relative(rootDir, absolute).split(path.sep).join("/"),
        absolute,
        bytes: statSync(absolute).size,
      });
    }
  };
  walk(rootDir);
  return out.sort((a, b) => a.relative.localeCompare(b.relative));
};
