import { join } from "node:path";

import type { ApiTemplates, Route, RouteAlias } from "../@types";
import { privateDefaults } from "../defaults";
import { fileGenerator } from "../base";
import { BANNER } from "../render";

import routeTpl from "./templates/route.tpl";
import routesTpl from "./templates/routes.tpl";
import urlmapTpl from "./templates/urlmap.tpl";
import cacheTsconfigTpl from "./templates/tsconfig.tpl";

const { generateFile } = fileGenerator();

let rootPath: string;
let sourceFolder: string;
let assetsDir: string;
let apiDir: string;

export async function bootstrap(data: {
  routes: Route[];
  aliases: RouteAlias[];
  cacheDir: string;
  apiDir: string;
  sourceFolder: string;
  rootPath: string;
  customTemplates: ApiTemplates;
}) {
  const { routes, cacheDir, customTemplates } = data;

  rootPath = data.rootPath;
  sourceFolder = data.sourceFolder;
  assetsDir = join(cacheDir, privateDefaults.cache.assetsDir);
  apiDir = data.apiDir;

  await updateTsconfig(data);

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
    [
      privateDefaults.api.routesFile,
      routesTpl,
      [...data.routes, ...data.aliases],
    ],
    [privateDefaults.api.urlmapFile, urlmapTpl, data.routes],
  ] as [string, string, Route[] | RouteAlias[]][];

  for (const [outFile, template, routes] of fileMap) {
    await generateFile(join(apiDir, outFile), {
      template,
      context: {
        BANNER,
        apiDir,
        sourceFolder,
        // do not use join here, it is dropping everything before ..
        assetsDir: assetsDir.replace(rootPath, `${sourceFolder}/..`),
        routes: routes.sort(routeSorter),
      },
    });
  }
}

async function updateTsconfig({ cacheDir }: { cacheDir: string }) {
  const tsconfigFile = join(cacheDir, "tsconfig.json");

  await generateFile(tsconfigFile, {
    template: cacheTsconfigTpl,
    context: {
      sourceFolder,
      base: join(
        ...tsconfigFile
          .replace(rootPath, "")
          .replace(/^\/+|\/+$/, "")
          .replace(join(sourceFolder, "tsconfig.json"), "")
          .split(/\/+/)
          .map(() => ".."),
      ),
    },
  });
}

function routeSorter(a: Route | RouteAlias, b: Route | RouteAlias) {
  return b.path.split("/").length - a.path.split("/").length;
}
