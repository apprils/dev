import { join, resolve } from "path";

const CWD = process.cwd();

export function resolvePath(...path: string[]): string {
  return resolve(CWD, join(...path));
}

export function sanitizePath(path: string): string {
  return path.replace(/\.+\/+/g, "");
}
