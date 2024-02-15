import { join, resolve } from "path";

import { type ResolvedConfig } from "vite";
import fsx from "fs-extra";

import { renderToFile } from "./render";

const CWD = process.cwd();

// a folder inside cacheDir
export const GENERATED_FILES_DIR = "generated-files-handler";

export function resolvePath(...path: string[]): string {
  return resolve(CWD, join(...path));
}

export function sanitizePath(path: string): string {
  return path.replace(/\.+\/+/g, "");
}

export function filesGeneratorFactory(config: ResolvedConfig) {
  const generatedFiles = new Set<string>();

  function generateFile<RenderContext = object>(
    outfile: string,
    render: { template: string; context: RenderContext },
  ): Promise<void>;

  function generateFile(outfile: string, content: string): Promise<void>;

  function generateFile(
    ...args: [string, string | { template: string; context: object }]
  ) {
    const [outfile, rest] = args;
    generatedFiles.add(outfile);
    return typeof rest === "string"
      ? fsx.outputFile(resolvePath(outfile), rest, "utf8")
      : renderToFile(resolvePath(outfile), rest.template, rest.context);
  }

  return {
    generateFile,
    persistGeneratedFiles(outFile: string, lineMapper?: (f: string) => string) {
      return persistGeneratedFiles(
        lineMapper ? [...generatedFiles].map(lineMapper) : [...generatedFiles],
        { cacheDir: config.cacheDir, outFile },
      );
    },
  };
}

export function persistGeneratedFiles(
  entries: string[],
  { cacheDir, outFile }: { cacheDir: string; outFile: string },
) {
  return fsx.outputFile(
    join(cacheDir, GENERATED_FILES_DIR, outFile),
    [...entries].join("\n"),
  );
}
