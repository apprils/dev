import { join } from "node:path";

import type { ApiTemplates, Route, RouteAlias } from "../@types";
import { defaults } from "../defaults";
import { fileGenerator } from "../base";
import { BANNER } from "../render";

import routeTpl from "./templates/route.tpl";
import routesTpl from "./templates/routes.tpl";

const { generateFile } = fileGenerator();

let sourceFolder: string;
let sourceFolderPath: string;
let assetsDir: string;
let apiDir: string;

export async function bootstrap(data: {
  routes: Route[];
  aliases: RouteAlias[];
  apiDir: string;
  varDir: string;
  sourceFolder: string;
  sourceFolderPath: string;
  customTemplates: ApiTemplates;
}) {
  const { routes, varDir, customTemplates } = data;

  sourceFolder = data.sourceFolder;
  sourceFolderPath = data.sourceFolderPath;
  assetsDir = join(varDir, defaults.var.apiAssetsDir);
  apiDir = data.apiDir;

  await generateFile(join(assetsDir, "index.ts"), "export default {}", {
    overwrite: false,
  });

  for (const route of routes) {
    await generateRouteFiles({ route, customTemplates });
  }

  await generateIndexFiles(data);
}

export async function handleSrcFileUpdate({
  file,
  routes,
  aliases,
  customTemplates,
}: {
  file: string;
  routes: Route[];
  aliases: RouteAlias[];
  customTemplates: ApiTemplates;
}) {
  // making sure newly added routes have files generated
  for (const route of routes.filter((e) => e.srcFile === file)) {
    await generateRouteFiles({ route, customTemplates });
  }

  await generateIndexFiles({ routes, aliases });
}

async function generateRouteFiles({
  route,
  customTemplates,
}: { route: Route; customTemplates: ApiTemplates }) {
  await generateFile(
    route.file,
    {
      template: route.template || customTemplates.route || routeTpl,
      context: route,
    },
    { overwrite: false },
  );
}

async function generateIndexFiles(data: {
  routes: Route[];
  aliases: RouteAlias[];
}) {
  const fileMap = [
    // biome-ignore format:
    [defaults.api.routesFile, routesTpl, [...data.routes, ...data.aliases]],
  ] as [string, string, Route[] | RouteAlias[]][];

  for (const [outFile, template, routes] of fileMap) {
    await generateFile(join(apiDir, outFile), {
      template,
      context: {
        BANNER,
        apiDir,
        sourceFolder,
        // do not use join here, it is dropping everything before ..
        assetsDir: assetsDir.replace(sourceFolderPath, ".."),
        routes: routes.sort(routeSorter),
      },
    });
  }
}

function routeSorter(a: Route | RouteAlias, b: Route | RouteAlias) {
  return b.path.split("/").length - a.path.split("/").length;
}
