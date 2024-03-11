import { join, dirname } from "node:path";

import fsx from "fs-extra";

import type { Route } from "../@types";
import { privateDefaults } from "../defaults";
import { extractApiAssets } from "../ast";
import { fileGenerator } from "../base";

import enhancedTpl from "./templates/enhanced.tpl";
import simpleTpl from "./templates/simple.tpl";
import baseTpl from "./templates/base.tpl";
import indexTpl from "./templates/index.tpl";

const { generateFile } = fileGenerator();

let rootPath: string;
let sourceFolder: string;
let fetchDir: string;

export async function bootstrap(data: {
  routes: Route[];
  sourceFolder: string;
  rootPath: string;
  cacheDir: string;
  apiDir: string;
  importStringifyFrom?: string;
}) {
  const { routes, cacheDir, importStringifyFrom } = data;

  rootPath = data.rootPath;
  sourceFolder = data.sourceFolder;
  fetchDir = join(cacheDir, privateDefaults.cache.fetchDir);

  await updateTsconfig(data);

  await generateFile(join(fetchDir, "base.ts"), {
    template: baseTpl,
    context: {
      sourceFolder,
      importStringifyFrom,
    },
  });

  for (const route of routes) {
    await generateRouteAssets({ route });
  }

  await generateIndexFiles({ routes });
}

export async function handleSrcFileUpdate({
  file,
  routes,
}: {
  file: string;
  routes: Route[];
}) {
  // making sure newly added routes have assets generated
  for (const route of routes.filter((e) => e.srcFile === file)) {
    await generateRouteAssets({ route });
  }

  await generateIndexFiles({ routes });
}

export async function generateRouteAssets({
  route,
}: {
  route: Route;
}) {
  const { typeDeclarations, fetchDefinitions } = await extractApiAssets(
    route.fileFullpath,
    {
      root: sourceFolder,
      base: dirname(route.file),
    },
  );

  await generateFile(join(fetchDir, route.file), {
    template: fetchDefinitions ? enhancedTpl : simpleTpl,
    context: { ...route, typeDeclarations, fetchDefinitions },
  });
}

export async function generateIndexFiles({
  routes,
}: {
  routes: Route[];
}) {
  await generateFile(join(fetchDir, "index.ts"), {
    template: indexTpl,
    context: {
      routes,
    },
  });
}

async function updateTsconfig({
  sourceFolder,
  apiDir,
}: {
  sourceFolder: string;
  apiDir: string;
}) {
  const paths = {
    // join is inappropriate here, we need slashes in any environment
    "@fetch/*": `${fetchDir.replace(rootPath, "..")}/${apiDir}/*`,
  };

  const tsconfigPath = join(rootPath, sourceFolder, "tsconfig.json");

  let tsconfig = JSON.parse(await fsx.readFile(tsconfigPath, "utf8"));

  let updateTsconfig = false;

  for (const [key, val] of Object.entries(paths)) {
    if (tsconfig.compilerOptions.paths?.[key]?.includes?.(val)) {
      continue;
    }

    tsconfig = {
      ...tsconfig,
      compilerOptions: {
        ...tsconfig.compilerOptions,
        paths: {
          ...tsconfig.compilerOptions.paths,
          [key]: [val],
        },
      },
    };

    updateTsconfig = true;
  }

  if (updateTsconfig) {
    await fsx.writeJson(tsconfigPath, tsconfig, {
      spaces: 2,
    });
  }
}
