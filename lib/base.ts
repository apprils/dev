import { join, resolve } from "path";

import fsx from "fs-extra";

import { renderToFile } from "./render";

const CWD = process.cwd();

export function resolvePath(...path: string[]): string {
  return resolve(CWD, join(...path));
}

export function sanitizePath(path: string): string {
  return path.replace(/\.+\/+/g, "");
}

export function filesGeneratorFactory() {
  const generatedFiles = new Set<string>();

  type Render = { template: string; context: object };
  type Options = { overwrite?: boolean };

  function generateFile<RenderContext = object>(
    outfile: string,
    render: Render,
    options?: Options,
  ): Promise<void>;

  function generateFile(
    outfile: string,
    content: string,
    options?: Options,
  ): Promise<void>;

  async function generateFile(
    ...args: [f: string, c: string | Render, o?: Options]
  ) {
    const [outfile, content, options] = args;
    const file = resolvePath(outfile);

    generatedFiles.add(file);

    if (options?.overwrite === false) {
      if (await fsx.exists(file)) {
        return;
      }
    }

    typeof content === "string"
      ? await fsx.outputFile(file, content, "utf8")
      : await renderToFile(file, content.template, content.context);
  }

  return {
    generateFile,
    generatedFiles,
  };
}
