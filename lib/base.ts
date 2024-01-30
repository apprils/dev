import { join, resolve } from "path";

import fsx from "fs-extra";

import { renderToFile } from "./render";

const CWD = process.cwd();
export const GENERATED_FILES_TMPDIR = "../var/.cache/generatedFiles";

export function resolvePath(...path: string[]): string {
  return resolve(CWD, join(...path));
}

export function sanitizePath(path: string): string {
  return path.replace(/\.+\/+/g, "");
}

export function filesGeneratorFactory() {
  const generatedFiles = new Set<string>();

  function generateFile<RenderContext = {}>(
    outfile: string,
    render: { template: string; context: RenderContext },
  ): Promise<void>;

  function generateFile(outfile: string, content: string): Promise<void>;

  function generateFile(...args: any[]) {
    const [outfile, rest] = args;
    generatedFiles.add(outfile);
    return typeof rest === "string"
      ? fsx.outputFile(resolvePath(outfile), rest, "utf8")
      : renderToFile(resolvePath(outfile), rest.template, rest.context);
  }

  return {
    generateFile,
    persistGeneratedFiles(outfile: string, lineMapper?: (f: string) => string) {
      return persistGeneratedFiles(
        outfile,
        lineMapper ? [...generatedFiles].map(lineMapper) : [...generatedFiles],
      );
    },
  };
}

export function persistGeneratedFiles(outfile: string, entries: string[]) {
  return fsx.outputFile(
    resolvePath(GENERATED_FILES_TMPDIR, outfile),
    [...entries].join("\n"),
  );
}
