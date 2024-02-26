import { dirname, basename, join } from "path";

import type { FSWatcher, Plugin, ResolvedConfig } from "vite";

import { defaults } from "../defaults";
import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";
import workerPool from "../worker-pool";

import type { Route } from "../@types";

type Options = {
  apiDir?: string;
  filter?: (route: {
    name: string;
    path: string;
  }) => boolean;
  importStringifyFrom?: string;
};

const PLUGIN_NAME = "@appril:fetchGeneratorPlugin";

type WatchHandler = (file?: string) => Promise<void>;

export async function fetchGeneratorPlugin(opts: Options): Promise<Plugin> {
  const {
    apiDir = defaults.apiDir,
    filter = (_r) => true,
    importStringifyFrom,
  } = opts;

  let fetchDir: string;

  const sourceFolder = basename(resolvePath());

  const routeMap: Record<string, Route> = {};

  const watchMap: {
    srcFiles: Record<string, WatchHandler>;
  } = {
    srcFiles: {},
  };

  const generateIndexFiles = () => {
    return workerPool.fetchGenerator.generateIndexFiles({
      fetchDir,
      routes: Object.values(routeMap).filter(filter),
      sourceFolder,
      importStringifyFrom,
    });
  };

  const generateRouteAssets = (route: Route) => {
    return workerPool.fetchGenerator.generateRouteAssets({
      fetchDir,
      route,
      root: sourceFolder,
      base: dirname(route.file.replace(resolvePath(), "")),
    });
  };

  const runWatchHandlers = async (...keys: (keyof typeof watchMap)[]) => {
    for (const handler of keys.flatMap((k) => Object.values(watchMap[k]))) {
      await handler();
    }

    if (keys.includes("srcFiles")) {
      await generateIndexFiles();
    }
  };

  const runWatchHandler = async (file: string) => {
    if (routeMap[file]) {
      // some route updated, rebuilding fetch assets
      if (filter(routeMap[file])) {
        await generateRouteAssets(routeMap[file]);
      }
      return;
    }

    for (const key of Object.keys(watchMap) as (keyof typeof watchMap)[]) {
      if (watchMap[key]?.[file]) {
        await watchMap[key][file]();
        if (key === "srcFiles") {
          // some source file updated, rebuilding index files
          await generateIndexFiles();
        }
      }
    }
  };

  const armWatchHandlers = (watcher: FSWatcher) => {
    // watching source files for changes;
    // on every change rebuilding routeMap;
    for (const map of Object.values(watchMap)) {
      watcher.add(Object.keys(map));
    }

    // also watching files in apiDir for changes;
    // on every change looking for routeMap entry
    // and if matched, rebuilding assets for matched route
    watcher.add(`${resolvePath(apiDir)}/**/*.ts`);

    watcher.on("change", runWatchHandler);
  };

  async function configResolved(config: ResolvedConfig) {
    fetchDir = join(config.cacheDir, "@fetch");

    for (const { file, parser } of await sourceFilesParsers({ apiDir })) {
      watchMap.srcFiles[file] = async () => {
        const entries = await parser();

        // source file changed (or first time read), adding its routes to routeMap
        for (const { route } of entries) {
          routeMap[route.file] = route;
        }

        // then rebuild routes defined by changed (or first time read) file
        for (const { route } of entries) {
          runWatchHandler(route.file);
        }
      };
    }

    await runWatchHandlers("srcFiles");
  }

  return {
    name: PLUGIN_NAME,
    configResolved,
    configureServer(server) {
      armWatchHandlers(server.watcher);
    },
  };
}
