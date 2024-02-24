import { dirname, basename, join } from "path";
import { Worker } from "worker_threads";

import type { FSWatcher, Plugin, ResolvedConfig } from "vite";

import { defaults } from "../defaults";
import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";

import type { Route } from "../@types";
import type { WorkerData } from "./@types";

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

  const sourceFolder = basename(resolvePath());
  let fetchDir: string;

  const routeMap: Record<string, Route> = {};

  const watchMap: {
    srcFiles: Record<string, WatchHandler>;
  } = {
    srcFiles: {},
  };

  const createWorker = () => {
    return new Worker(join(__dirname, "fetch-generator-worker.js"));
  };

  let worker: InstanceType<typeof Worker> | undefined = createWorker();
  let workerExits = 0;

  worker.on("error", (error: unknown) => {
    console.error(`[ ${PLUGIN_NAME} ]: Worker Error`);
    console.log(error);
  });

  worker.on("exit", (code) => {
    workerExits += 1;
    process.stdout.write(
      `\n[ ${PLUGIN_NAME} ]: Worker Exited with code ${code}; `,
    );
    if (workerExits <= 100) {
      console.log("Restarting...");
      worker = createWorker();
    } else {
      console.error(`Worker exited ${workerExits} times, giving up`);
      worker = undefined;
    }
  });

  const runWorker = (msg: WorkerData) => worker?.postMessage(msg);

  const runWatchHandlers = async (...keys: (keyof typeof watchMap)[]) => {
    for (const handler of keys.flatMap((k) => Object.values(watchMap[k]))) {
      await handler();
    }

    if (keys.includes("srcFiles")) {
      runWorker({
        fetchDir,
        generateIndexFiles: {
          routes: Object.values(routeMap),
          sourceFolder,
          importStringifyFrom,
        },
      });
    }
  };

  const runWatchHandler = async (file: string) => {
    if (routeMap[file]) {
      if (filter(routeMap[file])) {
        runWorker({
          fetchDir,
          generateRouteAssets: {
            route: routeMap[file],
            root: sourceFolder,
            base: dirname(file.replace(resolvePath(), "")),
          },
        });
      }
      return;
    }

    for (const key of Object.keys(watchMap) as (keyof typeof watchMap)[]) {
      if (watchMap[key]?.[file]) {
        await watchMap[key][file]();
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
