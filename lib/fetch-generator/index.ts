import { basename } from "node:path";

import type { Plugin } from "vite";

import { defaults, privateDefaults } from "../defaults";
import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";
import { workerPool } from "../worker-pool";
import { bootstrap } from "./workers";

import type { Route } from "../@types";

type Options = {
  apiDir?: string;
  filter?: (route: Route) => boolean;
  importStringifyFrom?: string;
  usePolling?: boolean;
};

const PLUGIN_NAME = "@appril:fetchGeneratorPlugin";

type WatchHandler = (file?: string) => Promise<void>;

export async function fetchGeneratorPlugin(opts?: Options): Promise<Plugin> {
  const {
    apiDir = defaults.apiDir,
    filter = (_r: Route) => true,
    importStringifyFrom,
    usePolling = privateDefaults.usePolling,
  } = opts || {};

  const sourceFolder = basename(resolvePath());

  const srcWatchers: Record<string, WatchHandler> = {};

  const routeMap: Record<string, Route> = {};

  const runWatchHandler = async (file: string) => {
    if (srcWatchers[file]) {
      // updating routeMap
      await srcWatchers[file]();

      // then feeding routeMap to worker
      await workerPool.fetchGenerator.handleSrcFileUpdate({
        file,
        routes: Object.values(routeMap),
      });

      return;
    }

    if (routeMap[file]) {
      await workerPool.fetchGenerator.generateRouteAssets({
        route: routeMap[file],
      });
      return;
    }
  };

  // srcWatchers map should be ready by the time configureServer called,
  // so it's safer to run this here rather than inside configResolved
  for (const { file, parser } of await sourceFilesParsers({ apiDir })) {
    srcWatchers[file] = async () => {
      for (const { route } of await parser()) {
        if (filter(route)) {
          routeMap[route.fileFullpath] = route;
        }
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
        // absolute path to folder containing generated files
        cacheDir: config.cacheDir,
        apiDir,
        sourceFolder,
        rootPath: resolvePath(".."),
        importStringifyFrom,
      };

      config.command === "build"
        ? await bootstrap(payload)
        : await workerPool.fetchGenerator.bootstrap(payload);
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

      watcher.on("change", runWatchHandler);
    },
  };
}
