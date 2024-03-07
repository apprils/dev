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

// biome-ignore format:
const fileGeneratorQueue: Record<
  string,
  (() => Promise<void>)[] | undefined
> = {};

export function fileGenerator() {
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

    if (options?.overwrite === false) {
      if (await fsx.exists(file)) {
        return;
      }
    }

    // biome-ignore format:
    const worker = typeof content === "string"
      ? () => fsx.outputFile(file, content, "utf8")
      : () => renderToFile(file, content.template, content.context);

    if (Array.isArray(fileGeneratorQueue[file])) {
      fileGeneratorQueue[file]?.push(worker);
      return;
    }

    fileGeneratorQueue[file] = [];

    try {
      await worker();
      for (const worker of fileGeneratorQueue[file] || []) {
        await worker();
      }
      generatedFiles.add(file);
    } finally {
      fileGeneratorQueue[file] = undefined;
    }
  }

  return {
    generateFile,
    generatedFiles,
  };
}
