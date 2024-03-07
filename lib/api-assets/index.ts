import { basename } from "path";

import type { Plugin } from "vite";
import { glob } from "fast-glob";
import fsx from "fs-extra";

import type { Route, TypeFile } from "../@types";
import { defaults, privateDefaults } from "../defaults";
import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";
import { worker, workerPool } from "../worker-pool";
import { bootstrap } from "./workers";

type Options = {
  apiDir?: string;
  filter?: (route: Route) => boolean;
  typeMap?: Record<string, string | string[]>;
  importZodErrorHandlerFrom?: string;
  usePolling?: boolean;
};

type WatchHandler = (file?: string) => Promise<void>;

const PLUGIN_NAME = "@appril:apiAssetsPlugin";

export async function apiAssetsPlugin(opts?: Options): Promise<Plugin> {
  const {
    apiDir = defaults.apiDir,
    filter = (_r: Route) => true,
    typeMap,
    importZodErrorHandlerFrom,
    usePolling = privateDefaults.usePolling,
  } = opts || {};

  const sourceFolder = basename(resolvePath());

  const srcWatchers: Record<string, WatchHandler> = {};

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

  const runWatchHandler = async (file: string) => {
    if (srcWatchers[file]) {
      // updating routeMap
      await srcWatchers[file]();
      // then feeding routeMap to worker
      await workerPool.apiAssets.handleSrcFileUpdate({
        file,
        routes: Object.values(routeMap),
        typeFiles: Object.values(typeFiles),
      });
      return;
    }

    if (routeMap[file]) {
      // some route updated, rebuilding assets
      if (filter(routeMap[file])) {
        await workerPool.apiAssets.generateRouteAssets({
          route: routeMap[file],
          typeFiles: Object.values(typeFiles),
        });
      }
      return;
    }

    if (typeFiles[file]) {
      typeFiles[file].content = await fsx.readFile(file, "utf8");
      for (const routeFile of typeFiles[file].routes) {
        await runWatchHandler(routeFile);
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

  // srcWatchers map should be ready by the time configureServer called,
  // so it's safer to run this here rather than inside configResolved
  for (const { file, parser } of await sourceFilesParsers({ apiDir })) {
    srcWatchers[file] = async () => {
      for (const { route } of await parser()) {
        routeMap[route.fileFullpath] = filter(route)
          ? { ...route, assetsPath: `./${route.importPath}` }
          : route;
      }
    };
  }

  return {
    name: PLUGIN_NAME,

    async configResolved(config) {
      // populating routeMap for bootstrap
      for (const handler of Object.values(srcWatchers)) {
        await handler();
      }

      const payload = {
        routes: Object.values(routeMap),
        sourceFolder,
        cacheDir: config.cacheDir,
        typeFiles: Object.values(typeFiles),
        importZodErrorHandlerFrom,
      };

      config.command === "build"
        ? await bootstrap(payload)
        : await workerPool.apiAssets.bootstrap(payload);
    },

    configureServer({ watcher }) {
      watcher.options = {
        ...watcher.options,
        disableGlobbing: false,
        usePolling,
      };

      // watching source files for changes
      watcher.add(Object.keys(srcWatchers));

      // also watching files in apiDir for changes
      watcher.add(`${resolvePath(apiDir)}/**/*.ts`);

      // also watching type files
      watcher.add(Object.keys(typeFiles));

      watcher.on("change", runWatchHandler);
    },
  };
}
