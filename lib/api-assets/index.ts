import type { Worker } from "node:worker_threads";

import type { ResolvedConfig } from "vite";
import { glob } from "fast-glob";
import fsx from "fs-extra";

import type {
  ResolvedPluginOptions,
  Route,
  TypeFile,
  BootstrapPayload,
} from "../@types";

import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";

type Workers = typeof import("./workers");

export async function apiAssets(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  { worker, workerPool }: { worker: Worker; workerPool: Workers },
) {
  const { sourceFolder, apiDir } = options;

  const {
    filter = (_r: Route) => true,
    typeMap,
    importZodErrorHandlerFrom,
  } = options.apiAssets;

  const srcWatchers: Record<string, () => Promise<void>> = {};

  const typeFiles: Record<string, TypeFile> = {};

  const routeMap: Record<string, Route> = {};

  for (const [importPath, patterns] of Object.entries(typeMap || {})) {
    const files = await glob(patterns, {
      cwd: resolvePath(),
      onlyFiles: true,
      absolute: true,
      unique: true,
    });

    for (const file of files) {
      typeFiles[file] = {
        file,
        importPath,
        content: await fsx.readFile(file, "utf8"),
        routes: new Set(),
      };
    }
  }

  const watchHandler = async (file: string) => {
    if (srcWatchers[file]) {
      // updating routeMap
      await srcWatchers[file]();

      // then feeding routeMap to worker
      await workerPool.handleSrcFileUpdate({
        file,
        routes: Object.values(routeMap),
        typeFiles: Object.values(typeFiles),
      });

      return;
    }

    if (routeMap[file]) {
      // some route updated, rebuilding assets
      if (filter(routeMap[file])) {
        await workerPool.handleRouteFileUpdate({
          route: routeMap[file],
          typeFiles: Object.values(typeFiles),
        });
      }
      return;
    }

    if (typeFiles[file]) {
      typeFiles[file].content = await fsx.readFile(file, "utf8");
      for (const routeFile of typeFiles[file].routes) {
        await watchHandler(routeFile);
      }
      return;
    }
  };

  worker?.on("message", ({ pool, task, data }) => {
    if (pool !== "apiAssets" || task !== "updateTypeFiles") {
      return;
    }

    const { typeFile, addRoute, removeRoute } = data;

    if (addRoute) {
      typeFiles[typeFile]?.routes.add(addRoute);
    } else if (removeRoute) {
      typeFiles[typeFile]?.routes.delete(removeRoute);
    }
  });

  for (const { file, parser } of await sourceFilesParsers({ apiDir })) {
    srcWatchers[file] = async () => {
      for (const { route } of await parser()) {
        routeMap[route.fileFullpath] = filter(route)
          ? { ...route, assetsPath: `./${route.importPath}` }
          : route;
      }
    };
  }

  // populating routeMap for bootstrap
  for (const handler of Object.values(srcWatchers)) {
    await handler();
  }

  const bootstrapPayload: BootstrapPayload<Workers> = {
    routes: Object.values(routeMap),
    sourceFolder,
    cacheDir: config.cacheDir,
    typeFiles: Object.values(typeFiles),
    importZodErrorHandlerFrom,
  };

  return {
    bootstrapPayload,
    watchHandler,
    watchPatterns: [
      // watching source files for changes
      ...Object.keys(srcWatchers),
      // also watching files in apiDir for changes
      ...[`${resolvePath(apiDir)}/**/*.ts`],
      // also watching type files
      ...Object.keys(typeFiles),
    ],
  };
}
