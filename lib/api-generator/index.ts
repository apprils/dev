import { basename, join } from "path";

import type { FSWatcher, Plugin, ResolvedConfig } from "vite";

import fsx from "fs-extra";

import type { Route } from "../@types";

import { defaults, privateDefaults } from "../defaults";
import { resolvePath, filesGeneratorFactory } from "../base";
import { sourceFilesParsers } from "../api";
import { BANNER } from "../render";

import routeTpl from "./templates/route.tpl";
import routesTpl from "./templates/routes.tpl";
import urlmapTpl from "./templates/urlmap.tpl";

import cacheTsconfigTpl from "./templates/tsconfig.tpl";

const defaultTemplates = {
  route: routeTpl,
  routes: routesTpl,
  urlmap: urlmapTpl,
};

type Templates = Record<keyof typeof defaultTemplates, string>;

type Options = {
  apiDir?: string;
  templates?: Partial<Templates>;
  importZodErrorHandlerFrom?: string;
  typeFiles?: Record<string, string[]>;
};

// aliases are not reflected in in urlmap
type RouteAlias = Omit<Route, "serialized">;

/** {apiDir}/_routes.yml schema:

# will generate {apiDir}/some-route.ts
some-route:

# will generate {apiDir}/account/activate/index.ts
account/activate/:

# will generate {apiDir}/account/activate/verify.ts
account/activate/verify:

# will generate {apiDir}/some-page.html.ts
some-page.html:

# will generate {apiDir}/another-page.html/index.ts
another-page.html/:

# aliases
users/login:
  alias: users/authorize

# or
users/login:
  alias:
    - users/authorize
    - login

# provide meta object
some-route:
  meta:
    restricted: true
    privileges:
      role: manager

*/

/**
 * Generates various files based on {apiDir}/_routes.yml
 *
 * Generated files:
 *    - {apiDir}/{route}.ts (or {apiDir}/{route}/index.ts if path ends in a slash)
 *    - {apiDir}/_routes.ts - importing route files and exporting mapped routes
 *    - {apiDir}/_urlmap.ts
 *
 * @param {object} [opts={}] - options
 * @param {string} [opts.apiDir="api"] - path to api folder where to place generated files
 * @param {object} [opts.templates={}] - custom templates
 */

const PLUGIN_NAME = "@appril:apiGeneratorPlugin";

type WatchHandler = (file?: string) => Promise<void>;

export async function apiGeneratorPlugin(opts: Options): Promise<Plugin> {
  const { apiDir = defaults.apiDir } = opts;

  const sourceFolder = basename(resolvePath());

  const outDirSuffix = "client";

  const { generateFile } = filesGeneratorFactory();

  const routeMap: Record<string, Route> = {};
  const aliasMap: Record<string, RouteAlias> = {};

  const watchMap: {
    tplFiles: Record<string, WatchHandler>;
    srcFiles: Record<string, WatchHandler>;
  } = {
    tplFiles: {},
    srcFiles: {},
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
    if (watchMap.tplFiles[file]) {
      await watchMap.tplFiles[file]();
      // rebuilding everything else when some template updated
      await runWatchHandlers("srcFiles");
      return;
    }

    for (const key of Object.keys(watchMap) as (keyof typeof watchMap)[]) {
      if (watchMap[key]?.[file]) {
        await watchMap[key][file]();
      }
    }
  };

  const armWatchHandlers = (watcher: FSWatcher) => {
    for (const map of Object.values(watchMap)) {
      watcher.add(Object.keys(map));
    }
    watcher.on("change", runWatchHandler);
  };

  const readTemplate = (file: string) => {
    return fsx.readFile(/^\//.test(file) ? file : resolvePath(file), "utf8");
  };

  const templates = { ...defaultTemplates };

  for (const [name, file] of Object.entries({ ...opts.templates }) as [
    name: keyof Templates,
    file: string,
  ][]) {
    watchMap.tplFiles[resolvePath(file)] = async () => {
      // watching custom templates for updates
      templates[name] = await readTemplate(file);
    };
  }

  // const typeFiles: Record<string, TypeFile> = {};
  //
  // for (const [importPath, patterns] of Object.entries(opts.typeFiles || {})) {
  //   const entries = await glob(patterns, {
  //     cwd: resolvePath(),
  //     withFileTypes: true, // glob also returns folders, we need only files
  //   });
  //
  //   for (const file of entries.flatMap((e) =>
  //     e.isFile() ? [e.fullpath()] : [],
  //   )) {
  //     typeFiles[file] = {
  //       importPath,
  //       file,
  //       content: await fsx.readFile(file, "utf8"),
  //       async rebuild() {
  //         this.content = await fsx.readFile(this.file, "utf8");
  //       },
  //     };
  //   }
  // }

  const generateIndexFiles = async () => {
    const routesWithAlias = Object.values({
      ...aliasMap,
      ...routeMap, // routeMap can/should override aliasMap entries
    });

    const routesNoAlias = Object.values(routeMap);

    for (const [outFile, template, routes] of [
      [privateDefaults.routesFile, templates.routes, routesWithAlias],
      [privateDefaults.urlmapFile, templates.urlmap, routesNoAlias],
    ] as const) {
      await generateFile(join(apiDir, outFile), {
        template,
        context: {
          BANNER,
          apiDir,
          sourceFolder,
          routes,
        },
      });
    }
  };

  async function configResolved(config: ResolvedConfig) {
    const cacheTsconfigFile = join(config.cacheDir, "tsconfig.json");
    const cacheTsconfigRelpath = join(sourceFolder, "tsconfig.json");

    await generateFile(cacheTsconfigFile, {
      template: cacheTsconfigTpl,
      context: {
        sourceTsconfig: join(
          ...cacheTsconfigFile
            .replace(resolvePath(".."), "")
            .replace(/^\/+|\/+$/, "")
            .replace(cacheTsconfigRelpath, "")
            .split(/\/+/)
            .map(() => ".."),
          cacheTsconfigRelpath,
        ),
      },
    });

    for (const { file, parser } of await sourceFilesParsers({ apiDir })) {
      watchMap.srcFiles[file] = async () => {
        for (const { setup, route, aliases } of await parser()) {
          const { path } = route;

          routeMap[path] = route;

          for (const alias of aliases) {
            const { importName, serialized, ...route } = routeMap[path];
            aliasMap[alias] = {
              ...route,
              name: alias,
              importName: [importName, alias.replace(/\W/g, "_")].join("$"),
              path: join("/", alias),
            };
          }

          // if (heuristicsFilter({ name, path, file })) {
          //   const {
          //     typeDeclarations,
          //     fetchDefinitions,
          //     middleworkerParams,
          //     middleworkerPayloadTypes,
          //   } = await extractApiAssets(file, {
          //     root: sourceFolder,
          //     base: dirname(file.replace(resolvePath(), "")),
          //   });
          //
          //   routeMap[path].middleworkerParams = JSON.stringify(
          //     middleworkerParams || {},
          //   );
          //
          //   routeMap[path].typeDeclarations = typeDeclarations;
          //   routeMap[path].fetchDefinitions = fetchDefinitions;
          // const zodSchemaPath = await zodSchemaFactory({
          //   sourceFolder,
          //   path: importPath,
          //   middleworkerPayloadTypes,
          //   typeDeclarations,
          //   typeFiles: Object.values(typeFiles),
          //   importZodErrorHandlerFrom,
          //   cacheDir: config.cacheDir,
          // });
          //
          // if (zodSchemaPath) {
          //   routeMap[path].payloadValidation = {
          //     importName: `${importName}$PayloadValidation`,
          //     importPath: zodSchemaPath,
          //   };
          // }
          // }

          // await generateFile(join(fetchDir, `${name}.ts`), {
          //   template: routeMap[path].fetchDefinitions
          //     ? fetchEnhancedTpl
          //     : fetchSimpleTpl,
          //   context: routeMap[path],
          // });

          const template = setup?.template
            ? await readTemplate(setup?.template)
            : templates.route;

          await generateFile(
            file,
            {
              template,
              context: {
                ...setup,
                ...routeMap[path],
              },
            },
            { overwrite: false },
          );
        }
      };
    }

    await runWatchHandlers("tplFiles", "srcFiles");
  }

  return {
    name: PLUGIN_NAME,

    config(config) {
      if (!config.build?.outDir) {
        throw new Error("Config is missing build.outDir");
      }
      return {
        build: {
          outDir: join(config.build.outDir, outDirSuffix),
        },
      };
    },

    configResolved,

    configureServer(server) {
      armWatchHandlers(server.watcher);
    },
  };
}
