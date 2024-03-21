import { join, dirname } from "node:path";

import fsx from "fs-extra";

import type { Route } from "../@types";
import { defaults } from "../defaults";
import { extractApiAssets } from "../ast";
import { fileGenerator } from "../base";

import enhancedTpl from "./templates/enhanced.tpl";
import simpleTpl from "./templates/simple.tpl";
import baseTpl from "./templates/base.tpl";
import indexTpl from "./templates/index.tpl";

const { generateFile } = fileGenerator();

let sourceFolder: string;
let sourceFolderPath: string;
let apiDir: string;
let varDir: string;

export async function bootstrap(data: {
  routes: Route[];
  sourceFolder: string;
  sourceFolderPath: string;
  apiDir: string;
  varDir: string;
}) {
  const { routes } = data;

  sourceFolder = data.sourceFolder;
  sourceFolderPath = data.sourceFolderPath;
  apiDir = data.apiDir;
  varDir = data.varDir;

  await updateTsconfig();

  await generateFile(join(varDir, defaults.var.fetchDir, "base.ts"), {
    template: baseTpl,
    context: {
      sourceFolder,
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

export async function handleRouteFileUpdate({
  route,
}: {
  route: Route;
}) {
  await generateRouteAssets({ route });
}

async function generateRouteAssets({
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

  await generateFile(join(varDir, defaults.var.fetchDir, route.file), {
    template: fetchDefinitions ? enhancedTpl : simpleTpl,
    context: { ...route, typeDeclarations, fetchDefinitions },
  });
}

async function generateIndexFiles({
  routes,
}: {
  routes: Route[];
}) {
  await generateFile(join(varDir, defaults.var.fetchDir, "index.ts"), {
    template: indexTpl,
    context: {
      routes,
    },
  });
}

async function updateTsconfig() {
  const paths = {
    // join is inappropriate here, we need slashes in any environment
    "@fetch/*": `./${varDir}/${defaults.var.fetchDir}/${apiDir}/*`,
  };

  const tsconfigPath = join(sourceFolderPath, "tsconfig.json");

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
