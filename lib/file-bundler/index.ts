import { basename, join } from "path";

import fsx from "fs-extra";
import { glob } from "glob";

import { resolvePath, filesGeneratorFactory } from "../base";
import { BANNER } from "../render";

import type { Plugin, ResolvedConfig } from "vite";
import type { Path } from "path-scurry";

type ContextFolder = {
  folder: string;
  files: ResolvedFile[];
};

type Context = {
  files: ResolvedFile[];
  folders: ContextFolder[];
};

type ContextHandler = (data: Context) => unknown;

type Entry = {
  path: string;
  folders?: string[];
  pattern?: string | string[];
  ignore?: string | string[];
  defaultIgnore?: string | string[];
  template: string;
  outfile: string;
  context?: ContextHandler;
};

type ResolvedFile = {
  name: string;
  basename: string;
  path: string;
  relativePath: string;
  folder: string;
  importName: string;
  importPath: string;
  content: string;
  match: Path;
};

const PLUGIN_NAME = "vite-plugin-file-bundler";

export function vitePluginFileBundler(entries: Entry[]): Plugin {
  const sourceFolder = basename(resolvePath());

  async function resolveFiles(
    config: ResolvedConfig,
    entry: Required<Entry>,
  ): Promise<ResolvedFile[]> {
    const files: ResolvedFile[] = [];

    const patterns = Array.isArray(entry.pattern)
      ? entry.pattern
      : [entry.pattern];

    const { folders } = entry;

    const patternMapper = (p: string) => {
      return folders.length
        ? folders.map((f) => resolvePath(entry.path, f, p))
        : [resolvePath(entry.path, p)];
    };

    const matches = await glob(patterns.flatMap(patternMapper), {
      cwd: resolvePath(entry.path),
      withFileTypes: true,
      ignore: [
        ...(Array.isArray(entry.ignore)
          ? entry.ignore
          : entry.ignore
            ? [entry.ignore]
            : []),
        ...(Array.isArray(entry.defaultIgnore)
          ? entry.defaultIgnore
          : entry.defaultIgnore
            ? [entry.defaultIgnore]
            : []),
      ],
    });

    for (const match of matches) {
      if (match.isDirectory()) {
        const entryFiles = await resolveFiles(config, entry);
        files.push(...entryFiles);
      } else if (match.isFile()) {
        if (match.name === entry.outfile) {
          continue;
        }

        const name = match.relative().replace(/\.([^.]+)$/, "");

        // biome-ignore format:
        const folder = entry.folders.find(
          (f) => new RegExp(`^${f}/`).test(name)
        ) || "";

        const content = await fsx.readFile(match.fullpath(), "utf8");

        files.push({
          name,
          basename: folder ? name.replace(new RegExp(`^${folder}/`), "") : name,
          path: match.fullpath(),
          relativePath: match.relative(),
          folder,
          importName: `$${match.relative().replace(/[^\w]/g, "_")}`,
          importPath: `./${name}`,
          content,
          match,
        });
      }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function generateFiles(config: ResolvedConfig) {
    const filesGenerator = filesGeneratorFactory(config);

    for (const _entry of entries) {
      const entry: Required<Entry> = {
        pattern: "**/*.ts",
        folders: [],
        ignore: [],
        defaultIgnore: ["**/_*", "**/@*"],
        context: (data) => data,
        ..._entry,
      };

      const files = await resolveFiles(config, entry);

      const template = await fsx.readFile(resolvePath(entry.template), "utf8");

      const folderMapper = (folder: string) => ({
        folder,
        files: files.filter((f) => f.folder === folder),
      });

      const context = entry.context({
        files,
        folders: entry.folders.map(folderMapper),
      });

      await filesGenerator.generateFile(entry.outfile, {
        template,
        context: {
          BANNER,
          ...(context || {}),
        },
      });
    }

    await filesGenerator.persistGeneratedFiles(PLUGIN_NAME, (f) =>
      resolvePath(f).replace(`${resolvePath("..")}/`, ""),
    );
  }

  return {
    name: PLUGIN_NAME,
    configResolved: generateFiles,
  };
}
