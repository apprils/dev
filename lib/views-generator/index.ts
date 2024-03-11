import { basename } from "node:path";

import fsx from "fs-extra";

import type { Plugin } from "vite";

import type { View, ViewTemplates } from "../@types";
import { defaults, privateDefaults } from "../defaults";
import { resolvePath } from "../base";
import { sourceFilesParsers } from "./parsers";
import { workerPool } from "../worker-pool";
import { bootstrap } from "./workers";

type Options = {
  routesDir?: string;
  viewsDir?: string;
  storesDir?: string;
  apiDir?: string;
  templates?: ViewTemplates;
  usePolling?: boolean;
};

/** {viewsDir}/_views.yml schema:

some-view:
# will generate {viewsDir}/some-view.vue

another-view/:
# will generate {viewsDir}/another-view/another-view.vue

another-view/base:
# will generate {viewsDir}/another-view/base.vue

some-page.html:
# will generate {viewsDir}/some-page.html.vue

# provide meta
some-view:
  meta:
    restricted: true
    privileges:
      role: manager
*/

/**
 * Generates various files based on {viewsDir}/_views.yml
 *
 * Generated files:
 *    - {viewsDir}/{view}.vue (or {viewsDir}/{view}/{view}.vue if path ends in a slash)
 *    - {routesDir}/_routes.ts
 *    - {routesDir}/_routes.d.ts
 *    - {storesDir}/env.ts
 *
 * @param {Object} [opts={}] - options
 * @param {string} [opts.routesDir="router"] - path to routes folder
 * @param {string} [opts.viewsDir="views"] - path to views folder (should contain _views.yml file)
 * @param {string} [opts.storesDir="stores"] - path to stores folder
 * @param {string} [opts.apiDir="api"] - path to api folder
 * @param {object} [opts.templates={}] - custom templates
 */

const PLUGIN_NAME = "@appril:viewsGeneratorPlugin";

type WatchHandler = (file?: string) => Promise<void>;

export async function viewsGeneratorPlugin(opts?: Options): Promise<Plugin> {
  const {
    routesDir = defaults.routesDir,
    viewsDir = defaults.viewsDir,
    storesDir = defaults.storesDir,
    apiDir = defaults.apiDir,
    usePolling = privateDefaults.usePolling,
  } = { ...opts };

  const sourceFolder = basename(resolvePath());

  const viewMap: Record<string, View> = {};

  const tplWatchers: Record<string, WatchHandler> = {};
  const srcWatchers: Record<string, WatchHandler> = {};

  const customTemplates: ViewTemplates = {};

  const runWatchHandler = async (file: string) => {
    if (tplWatchers[file]) {
      // updating templates; to be used on newly added views only
      // so no need to update anything here
      await tplWatchers[file]();
      return;
    }

    if (srcWatchers[file]) {
      // updating viewMap
      await srcWatchers[file]();

      // then feeding it to worker
      await workerPool.viewsGenerator.handleSrcFileUpdate({
        file,
        views: Object.values(viewMap),
        customTemplates,
      });

      return;
    }
  };

  return {
    name: PLUGIN_NAME,

    async configResolved(config) {
      for (const [name, file] of Object.entries(opts?.templates || {}) as [
        name: keyof ViewTemplates,
        file: string,
      ][]) {
        tplWatchers[resolvePath(file)] = async () => {
          customTemplates[name] = await fsx.readFile(resolvePath(file), "utf8");
        };
      }

      for (const { file, parser } of await sourceFilesParsers({
        config,
        viewsDir,
      })) {
        srcWatchers[file] = async () => {
          for (const { view } of await parser()) {
            viewMap[view.path] = view;
          }
        };
      }

      // populating tplWatchers for bootstrap
      for (const handler of Object.values(tplWatchers)) {
        await handler();
      }

      // populating srcWatchers for bootstrap (only call alfter tplWatchers populated)
      for (const handler of Object.values(srcWatchers)) {
        await handler();
      }

      const payload = {
        views: Object.values(viewMap),
        sourceFolder,
        routesDir,
        storesDir,
        viewsDir,
        apiDir,
        customTemplates,
      };

      config.command === "build"
        ? bootstrap(payload)
        : await workerPool.viewsGenerator.bootstrap(payload);
    },

    configureServer({ watcher }) {
      watcher.options = {
        ...watcher.options,
        disableGlobbing: false,
        usePolling,
      };

      watcher.add(Object.keys(tplWatchers));
      watcher.add(Object.keys(srcWatchers));

      watcher.on("change", runWatchHandler);
    },
  };
}
