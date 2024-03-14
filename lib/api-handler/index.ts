import { resolve, join } from "node:path";

import type { ResolvedConfig } from "vite";

import { esbuildHandler } from "./esbuild";
import type { ResolvedPluginOptions } from "../@types";

export function apiHandlerFactory(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
) {
  const { esbuildConfig, sourceFolder, apiDir } = options;
  const { flushPatterns } = options.apiHandler;

  return esbuildHandler(esbuildConfig, {
    sourceFolder,
    apiDir,
    outDir: resolve(config.build.outDir, join("..", apiDir)),
    flushPatterns,
  });
}
