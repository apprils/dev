import { basename, join, resolve } from "node:path";

import type { ResolvedConfig } from "vite";
import { glob } from "fast-glob";
import { parse } from "yaml";
import fsx from "fs-extra";

import { sanitizePath } from "../base";
import type { ResolvedPluginOptions, View, ViewSetup } from "../@types";

export async function sourceFilesParsers(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  pattern = "**/*_views.yml",
) {
  const { sourceFolderPath, viewsDir } = options;

  const parsers: {
    file: string;
    parser: () => Promise<{ view: View }[]>;
  }[] = [];

  const srcFiles = await glob(pattern, {
    cwd: resolve(sourceFolderPath, viewsDir),
    onlyFiles: true,
    absolute: true,
    unique: true,
  });

  for (const srcFile of srcFiles) {
    parsers.push({
      file: srcFile,
      async parser() {
        const viewDefs = parse(await fsx.readFile(srcFile, "utf8"));

        const entries: { view: View }[] = [];

        for (const [_path, setup] of Object.entries(viewDefs) as [
          string,
          ViewSetup,
        ][]) {
          const importPath = sanitizePath(_path).replace(/\/+$/, "");

          const suffix = /\/$/.test(_path)
            ? `/${basename(importPath)}.vue`
            : ".vue";

          const path = join(
            config.base,
            importPath.replace(/^index$/, ""),
          ).replace(/\/$/, "");

          let envApi: string | undefined;

          if (typeof setup?.env === "string") {
            envApi = setup.env;
          } else if (setup?.env === true) {
            envApi = join(_path, "env");
          }

          const view: View = {
            srcFile,
            name: importPath,
            importName: importPath.replace(/\W/g, "_"),
            path,
            params: String(setup?.params || ""),
            meta: JSON.stringify(setup?.meta || {}),
            options: JSON.stringify(setup?.options || {}),
            importPath: importPath + suffix,
            file: importPath + suffix,
            envApi,
          };

          const serialized = JSON.stringify({
            name: view.name,
            path: view.path,
          });

          entries.push({ view: { ...view, serialized } });
        }

        return entries;
      },
    });
  }

  return parsers;
}
