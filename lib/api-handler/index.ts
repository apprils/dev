import { resolve, basename, join } from "path";

import type { Plugin } from "vite";
import type { BuildOptions } from "esbuild";

import { resolvePath } from "../base";
import { defaults } from "../defaults";
import { esbuildHandler } from "./esbuild";

type Options = {
  esbuildConfig: BuildOptions;
  apiDir?: string;
  flushPatterns?: RegExp[];
};

const PLUGIN_NAME = "@appril:apiHandlerPlugin";

export async function apiHandlerPlugin(opts: Options): Promise<Plugin> {
  const { esbuildConfig, apiDir = defaults.apiDir, flushPatterns } = opts;

  let esbuilder: ReturnType<typeof esbuildHandler>;

  const sourceFolder = basename(resolvePath());
  return {
    name: PLUGIN_NAME,
    enforce: "post",

    async configResolved(config) {
      esbuilder = esbuildHandler(esbuildConfig, {
        sourceFolder,
        apiDir,
        outDir: resolve(config.build.outDir, join("..", apiDir)),
        flushPatterns,
      });
    },

    async configureServer() {
      await esbuilder?.watch();
    },

    async buildEnd(error) {
      if (!error) {
        await esbuilder?.build();
      }
    },
  };
}
