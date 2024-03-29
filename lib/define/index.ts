import { resolve } from "node:path";
import * as fs from "node:fs/promises";

import type { Plugin } from "vite";
import fsx from "fs-extra";
import { parse as dotenv } from "dotenv";

type File = {
  keys: string[] | "*";
  file?: string;
  defineOn?: string;
};

const PLUGIN_NAME = "@appril:definePlugin";

export function definePlugin(files: File[]): Plugin {
  const root = process.cwd();

  return {
    name: PLUGIN_NAME,

    async config() {
      const define: Record<string, unknown> = {};

      for (const { file: _file, keys, defineOn = "process.env" } of files) {
        define[defineOn] = {};

        let env = process.env;

        if (_file) {
          const file = resolve(root, _file);

          if (!(await fsx.pathExists(file))) {
            continue;
          }

          env = dotenv(await fs.readFile(file, "utf8"));
        }

        const filter = Array.isArray(keys)
          ? (key: string) => keys.includes(key)
          : (_key: string) => true;

        for (const key of Object.keys(env).filter(filter)) {
          define[`${defineOn}.${key}`] = JSON.stringify(env[key]);
        }
      }

      return { define };
    },
  };
}
