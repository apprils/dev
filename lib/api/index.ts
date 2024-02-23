import { resolve, dirname, basename, join } from "path";

import type { FSWatcher, Plugin, ResolvedConfig } from "vite";
import type { BuildOptions } from "esbuild";

import { glob } from "glob";
import { parse } from "yaml";
import fsx from "fs-extra";

import type { Route } from "./@types";

import { resolvePath, sanitizePath } from "../base";
import { BANNER, renderToFile } from "../render";
import { extractApiAssets } from "./ast";
import { esbuildHandler } from "./esbuild";

import routeTpl from "./templates/route.tpl";
import routesTpl from "./templates/routes.tpl";
import urlmapTpl from "./templates/urlmap.tpl";

import fetchBaseTpl from "./templates/fetch/base.tpl";
import fetchEnhancedTpl from "./templates/fetch/enhanced.tpl";
import fetchSimpleTpl from "./templates/fetch/simple.tpl";
import fetchIndexTpl from "./templates/fetch/index.tpl";

import cacheTsconfigTpl from "./templates/tsconfig.tpl";

const defaultTemplates = {
  route: routeTpl,
  routes: routesTpl,
  urlmap: urlmapTpl,
};

type Templates = Record<keyof typeof defaultTemplates, string>;

type Options = {
  esbuildConfig: BuildOptions;
  apiDir?: string;
  apiHmrFlushPatterns?: RegExp[];
  heuristicsFilter?: (r: Pick<Route, "name" | "path" | "file">) => boolean;
  sourceFiles?: string | string[];
  templates?: Partial<Templates>;
  importStringifyFrom?: string;
  importZodErrorHandlerFrom?: string;
  typeFiles?: Record<string, string[]>;
};

// aliases not reflected in fetch modules nor in urlmap
type RouteAlias = Omit<Route, "serialized" | "fetchModuleId">;

type RouteSetup = {
  name?: string;
  alias?: string | string[];
  file?: string;
  template?: string;
  meta?: Record<string, unknown>;
};

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
 * @param {string} [opts.esbuildConfig]
 * @param {string} [opts.apiDir="api"] - path to api folder.
 *    where to place generated files
 * @param {string} [opts.sourceFiles="**\/*_routes.yml"] - yaml files glob pattern
 *    files containing route definitions, resolved relative to apiDir
 * @param {object} [opts.templates={}] - custom templates
 */

const PLUGIN_NAME = "vite-plugin-appril-api";

type WatchHandler = (file?: string) => Promise<void>;

export async function vitePluginApprilApi(opts: Options): Promise<Plugin> {
  const {
    esbuildConfig,
    apiDir = "api",
    heuristicsFilter = (_r) => true,
    sourceFiles = "**/*_routes.yml",
    apiHmrFlushPatterns,
    importStringifyFrom,
  } = opts;

  const sourceFolder = basename(resolvePath());

  const outDirSuffix = "client";

  let esbuilder: ReturnType<typeof esbuildHandler>;

  const watchMap: {
    tplFiles: Record<string, WatchHandler>;
    srcFiles: Record<string, WatchHandler>;
    apiFiles: Record<string, WatchHandler>;
  } = {
    srcFiles: {},
    tplFiles: {},
    apiFiles: {},
  };

  const runWatchHandlers = async (...keys: (keyof typeof watchMap)[]) => {
    for (const handler of keys.flatMap((k) => Object.values(watchMap[k]))) {
      await handler();
    }
  };

  const runWatchHandler = async (file: string) => {
    if (watchMap.tplFiles[file]) {
      await watchMap.tplFiles[file]();
      // rebuilding everything when some templarte updated;
      // (apiFiles handlers would be triggered by srcFiles handlers)
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

  async function configResolved(config: ResolvedConfig) {
    const cacheTsconfigFile = join(config.cacheDir, "tsconfig.json");
    const cacheTsconfigRelpath = join(sourceFolder, "tsconfig.json");

    await renderToFile(cacheTsconfigFile, cacheTsconfigTpl, {
      sourceTsconfig: join(
        ...cacheTsconfigFile
          .replace(resolvePath(".."), "")
          .replace(/^\/+|\/+$/, "")
          .replace(cacheTsconfigRelpath, "")
          .split(/\/+/)
          .map(() => ".."),
        cacheTsconfigRelpath,
      ),
    });

    const fetchDir = join(config.cacheDir, "@fetch");

    esbuilder = esbuildHandler(esbuildConfig, {
      sourceFolder,
      apiDir,
      outDir: resolve(config.build.outDir, join("..", apiDir)),
      flushPatterns: apiHmrFlushPatterns,
    });

    const patterns = Array.isArray(sourceFiles)
      ? [...sourceFiles]
      : [sourceFiles];

    const routeMap: Record<string, Route> = {};
    const aliasMap: Record<string, RouteAlias> = {};

    const generateIndexFiles = async () => {
      const routesWithAlias = Object.values({
        ...aliasMap,
        ...routeMap, // routeMap can/should override aliasMap entries
      });

      const routesNoAlias = Object.values(routeMap);

      for (const [outFile, template, routes] of [
        ["_routes.ts", templates.routes, routesWithAlias],
        ["_urlmap.ts", templates.urlmap, routesNoAlias],
      ] as const) {
        await renderToFile(join(apiDir, outFile), template, {
          BANNER,
          apiDir,
          sourceFolder,
          routes,
        });
      }

      await renderToFile(join(fetchDir, "@base.ts"), fetchBaseTpl, {
        sourceFolder,
        importStringifyFrom,
      });

      await renderToFile(join(fetchDir, "@index.ts"), fetchIndexTpl, {
        routes: routesNoAlias,
      });
    };

    const resolvedSourceFiles = new Set<string>();

    // patterns are static, not watching
    for (const pattern of patterns) {
      for (const file of await glob(pattern, { cwd: resolvePath(apiDir) })) {
        resolvedSourceFiles.add(resolvePath(apiDir, file));
      }
    }

    for (const srcFile of resolvedSourceFiles) {
      watchMap.srcFiles[srcFile] = async () => {
        const fileContent = await fsx.readFile(srcFile, "utf8");
        const routeDefinitions = parse(fileContent);

        for (const [routePath, routeSetup] of Object.entries(
          routeDefinitions,
        ) as [path: string, setup: RouteSetup | undefined][]) {
          const name = sanitizePath(routeSetup?.name || routePath).replace(
            /\/+$/,
            "",
          );

          const importPath = routeSetup?.file
            ? sanitizePath(routeSetup.file.replace(/\.[^.]+$/, ""))
            : join(apiDir, name);

          const importName = importPath.replace(/\W/g, "_");

          // path should start with a slash
          const path = join("/", name);

          const fileExt = routeSetup?.file
            ? routeSetup.file.replace(/.+(\.[^.]+)$/, "$1")
            : /\/$/.test(routePath)
              ? "/index.ts"
              : ".ts";

          const file = resolvePath(importPath + fileExt);

          const meta = JSON.stringify(routeSetup?.meta || {});

          const serialized = JSON.stringify({
            name,
            path,
          });

          routeMap[path] = {
            name,
            importName,
            path,
            importPath,
            file,
            fileExt,
            meta,
            serialized,
            middleworkerParams: "{}",
          };

          // biome-ignore format:
          const aliases = typeof routeSetup?.alias === "string"
            ? [ routeSetup.alias ]
            : [ ...routeSetup?.alias || [] ]

          for (const alias of aliases) {
            const { importName, serialized, ...route } = routeMap[path];
            aliasMap[alias] = {
              ...route,
              name: alias,
              importName: [importName, alias.replace(/\W/g, "_")].join("$"),
              path: join("/", alias),
            };
          }

          watchMap.apiFiles[file] = async () => {
            if (heuristicsFilter({ name, path, file })) {
              const {
                typeDeclarations,
                fetchDefinitions,
                middleworkerParams,
                middleworkerPayloadTypes,
              } = await extractApiAssets(file, {
                root: sourceFolder,
                base: dirname(file.replace(resolvePath(), "")),
              });

              routeMap[path].middleworkerParams = JSON.stringify(
                middleworkerParams || {},
              );

              routeMap[path].typeDeclarations = typeDeclarations;
              routeMap[path].fetchDefinitions = fetchDefinitions;

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
            }

            await renderToFile(
              join(fetchDir, `${name}.ts`),
              routeMap[path].fetchDefinitions
                ? fetchEnhancedTpl
                : fetchSimpleTpl,
              routeMap[path],
            );

            const template = routeSetup?.template
              ? await readTemplate(routeSetup?.template)
              : templates.route;

            await renderToFile(
              file,
              template,
              {
                ...routeSetup,
                ...routeMap[path],
              },
              { overwrite: false },
            );
          };

          await watchMap.apiFiles[file]();
        }

        await generateIndexFiles();
      };
    }

    // srcFiles handlers would trigger apiFiles handlers
    await runWatchHandlers("tplFiles", "srcFiles");
  }

  return {
    name: PLUGIN_NAME,

    async buildEnd() {
      await esbuilder?.build();
    },

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

    async configureServer(server) {
      armWatchHandlers(server.watcher);

      // using separate watcher cause api depends on a wider set of files
      await esbuilder?.watch();
    },
  };
}
