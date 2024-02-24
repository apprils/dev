import { join } from "path";

import { glob } from "glob";
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

  for (const entry of await glob(pattern, {
    cwd: resolvePath(apiDir),
    withFileTypes: true,
  })) {
    const file = entry.fullpath();

    parsers.push({
      file,
      async parser() {
        const fileContent = await fsx.readFile(file, "utf8");
        const routeDefinitions = parse(fileContent);

        const entries = Object.entries(routeDefinitions) as [
          path: string,
          setup: RouteSetup | undefined,
        ][];

        return entries.map(([_path, setup]) => {
          const name = sanitizePath(setup?.name || _path).replace(/\/+$/, "");

          const importPath = setup?.file
            ? sanitizePath(setup.file.replace(/\.[^.]+$/, ""))
            : join(apiDir, name);

          const importName = importPath.replace(/\W/g, "_");

          // path should start with a slash
          const path = join("/", name);

          const fileExt = setup?.file
            ? setup.file.replace(/.+(\.[^.]+)$/, "$1")
            : /\/$/.test(_path)
              ? "/index.ts"
              : ".ts";

          const serialized = JSON.stringify({
            name,
            path,
          });

          const route: Route = {
            name,
            path,
            importName,
            importPath,
            file: resolvePath(importPath + fileExt),
            fileExt,
            meta: JSON.stringify(setup?.meta || {}),
            serialized,
          };

          const aliases =
            typeof setup?.alias === "string"
              ? [setup.alias]
              : [...(setup?.alias || [])];

          return { setup, route, aliases };
        });
      },
    });
  }

  return parsers;
}
