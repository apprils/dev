import { join } from "path";

import { glob } from "fast-glob";
import { parse } from "yaml";
import fsx from "fs-extra";

import { resolvePath, sanitizePath } from "./base";
import type { RouteSetup, Route } from "./@types";

export async function sourceFilesParsers({
  apiDir,
  pattern = "**/*_routes.yml",
}: { apiDir: string; pattern?: string }) {
  const parsers: {
    file: string;
    parser: () => Promise<
      { setup?: RouteSetup; route: Route; aliases: string[] }[]
    >;
  }[] = [];

  const srcFiles = await glob(pattern, {
    cwd: resolvePath(apiDir),
    onlyFiles: true,
    absolute: true,
    unique: true,
  });

  for (const srcFile of srcFiles) {
    parsers.push({
      file: srcFile,
      async parser() {
        const routeDefs = parse(await fsx.readFile(srcFile, "utf8"));

        const entries: {
          setup: RouteSetup;
          route: Route;
          aliases: string[];
        }[] = [];

        for (const [_path, setup] of Object.entries(routeDefs) as [
          string,
          RouteSetup,
        ][]) {
          const name = sanitizePath(setup?.name || _path).replace(/\/+$/, "");

          const importPath = setup?.file
            ? sanitizePath(setup.file.replace(/\.[^.]+$/, "")).replace(
                `${resolvePath()}/`,
                "",
              )
            : join(apiDir, name);

          const importName = importPath.replace(/\W/g, "_");

          // path should start with a slash
          const path = join("/", name);

          const fileExt = setup?.file
            ? setup.file.replace(/.+(\.[^.]+)$/, "$1")
            : /\/$/.test(_path)
              ? "/index.ts"
              : ".ts";

          const file = importPath + fileExt;

          const serialized = JSON.stringify({
            name,
            path,
          });

          let template = setup?.template;

          if (template) {
            // templates provided by routes are not watched for updates,
            // reading them once at source file parsing
            template = await fsx.readFile(
              /^\//.test(template) ? template : resolvePath(template),
              "utf8",
            );
          }

          const route: Route = {
            srcFile,
            name,
            path,
            importName,
            importPath,
            file,
            fileFullpath: resolvePath(file),
            meta: JSON.stringify(setup?.meta || {}),
            serialized,
            template,
          };

          const aliases =
            typeof setup?.alias === "string"
              ? [setup.alias]
              : [...(setup?.alias || [])];

          entries.push({ setup, route, aliases });
        }

        return entries;
      },
    });
  }

  return parsers;
}
