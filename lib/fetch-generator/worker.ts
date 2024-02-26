import { join } from "path";

import { extractApiAssets } from "../ast";
import { filesGeneratorFactory } from "../base";

import enhancedTpl from "./templates/enhanced.tpl";
import simpleTpl from "./templates/simple.tpl";
import baseTpl from "./templates/base.tpl";
import indexTpl from "./templates/index.tpl";
import type { Route } from "../@types";

type GenerateRouteAssets = {
  fetchDir: string;
  route: Route;
  root: string;
  base: string;
};

type GenerateIndexFiles = {
  fetchDir: string;
  routes: Route[];
  sourceFolder: string;
  importStringifyFrom?: string;
};

const { generateFile } = filesGeneratorFactory();

export async function generateRouteAssets({
  route,
  root,
  base,
  fetchDir,
}: GenerateRouteAssets) {
  const { typeDeclarations, fetchDefinitions } = await extractApiAssets(
    route.file,
    {
      root,
      base,
    },
  );

  await generateFile(join(fetchDir, `${route.name}.ts`), {
    template: fetchDefinitions ? enhancedTpl : simpleTpl,
    context: { ...route, typeDeclarations, fetchDefinitions },
  });
}

export async function generateIndexFiles({
  sourceFolder,
  fetchDir,
  importStringifyFrom,
  routes,
}: GenerateIndexFiles) {
  await generateFile(join(fetchDir, "@base.ts"), {
    template: baseTpl,
    context: {
      sourceFolder,
      importStringifyFrom,
    },
  });

  await generateFile(join(fetchDir, "@index.ts"), {
    template: indexTpl,
    context: {
      routes,
    },
  });
}
