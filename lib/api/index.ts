
import { dirname, basename, resolve, join } from "path";
import { readFile } from "fs/promises";

import type { Plugin } from "vite";
import fsx from "fs-extra";
import { glob } from "glob";
import { parse } from "yaml";
import { transform } from "esbuild";

import { BANNER, render } from "../render";
import { sanitizePath } from "../base";
import { parseFile } from "./ast";

import routeTpl from "./templates/route.tpl";
import routesTpl from "./templates/routes.tpl";
import urlmapTpl from "./templates/urlmap.tpl";

import fetchModuleTpl from "./templates/fetch/module.tpl";
import fetchIndexTpl from "./templates/fetch/module.d.tpl";
import fetchVirtualIndexTpl from "./templates/fetch/virtual.d.tpl";

const defaultTemplates = {
  route: routeTpl,
  routes: routesTpl,
  urlmap: urlmapTpl,
}

type Templates = Record<keyof typeof defaultTemplates, string>

type Options = {
  importBase: string;
  apiDir: string;
  fetchFilter: (r: Route) => boolean,
  sourceFiles: string | string[];
  templates: Partial<Templates>;
}

type Route = {
  name: string;
  importName: string;
  path: string;
  importPath: string;
  file: string;
  meta: string;
  serialized: string;
  fetchModule?: string;
}

type RouteSetup = {
  name?: string;
  file?: string;
  template?: string;
  meta?: Record<string, any>;
}

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
 *    - {apiDir}/_fetch.d.ts
 *    - {apiDir}/_urlmap.ts
 *
 * @param {object} [opts={}] - options
 * @param {string} [opts.apiDir="api"] - path to api folder.
 *    where to place generated files
 * @param {string} [opts.sourceFiles="**\/*_routes.yml"] - yaml files glob pattern
 *    files containing route definitions, resolved relative to apiDir
 * @param {object} [opts.templates={}] - custom templates
 */
export async function vitePluginApprilApi(
  opts: Partial<Options> = {},
): Promise<Plugin> {

  const {
    importBase = "@",
    apiDir = "api",
    fetchFilter = (_r) => true,
    sourceFiles = "**/*_routes.yml",
  } = opts

  const rootPath = (...path: string[]) => resolve(String(process.env.PWD), join(...path))

  const sourceFolder = basename(rootPath())

  const virtualModules: {
    fetch: Record<string, string>;
  } = {
    fetch: {},
  }

  const watchMap: {
    srcFiles: Record<string, Function>;
    tplFiles: Record<string, Function>;
    apiFiles: Record<string, Function>;
  } = {
    srcFiles: {},
    tplFiles: {},
    apiFiles: {},
  }

  const readTemplate = (file: string) => readFile(
    /^\//.test(file)
      ? file
      : rootPath(file),
    "utf8"
  )

  const templates = { ...defaultTemplates }

  const routeMap: Record<string, Route> = {}

  for (
    const [
      name,
      file,
    ] of Object.entries({ ...opts.templates }) as [
      name: keyof Templates,
      file: string
    ][]
  ) {
    const watchHandler = async () => templates[name] = await readTemplate(file)
    watchMap.tplFiles[rootPath(file)] = watchHandler
    await watchHandler()
  }

  const generateBaseFiles = async () => {

    const routes = Object.values(routeMap)

    for (const [ outFile, template ] of [
      [ rootPath(apiDir, "_routes.ts"), templates.routes ],
      [ rootPath(apiDir, "_urlmap.ts"), templates.urlmap ],
    ]) {

      const content = render(template, {
        BANNER,
        importBase,
        apiDir,
        sourceFolder,
        routes,
      })

      await fsx.outputFile(outFile, content, "utf8")

    }

  }

  const generateFetchModules = async () => {

    const routes = Object.values(routeMap).filter(fetchFilter)

    for (const route of routes) {

      const {
        typeDeclarations: fetchTypes,
        endpoints: fetchEndpoints,
      } = parseFile(
        await readFile(route.file, "utf8"),
        { importBase, base: dirname(route.file.replace(rootPath(), "")) }
      )

      route.fetchModule = render(fetchModuleTpl, {
        BANNER,
        importBase,
        apiDir,
        sourceFolder,
        fetchTypes,
        fetchEndpoints,
        ...route
      })

      virtualModules.fetch[`fetch:${ route.name }`] = route.fetchModule

    }

    virtualModules.fetch["fetch:"] = render(fetchVirtualIndexTpl, {
      importBase,
      apiDir,
      sourceFolder,
      routes,
    })

    // physical file, needed for editors
    const content = render(fetchIndexTpl, {
      BANNER,
      importBase,
      apiDir,
      sourceFolder,
      routes,
    })

    await fsx.outputFile(rootPath(apiDir, "_fetch.d.ts"), content, "utf8")

  }

  async function configResolved() {

    for (
      const pattern of Array.isArray(sourceFiles)
        ? [ ...sourceFiles ]
        : [ sourceFiles ]
    ) {

      for (const file of await glob(pattern, { cwd: rootPath(apiDir) })) {

        const filePath = rootPath(apiDir, file)

        const watchHandler = async () => {

          const fileContent = await readFile(filePath, "utf8")
          const routeDefinitions = parse(fileContent)

          for (
            const [
              routePath,
              routeSetup
            ] of Object.entries(routeDefinitions) as [
              path: string,
              setup: RouteSetup | undefined
            ][]
          ) {

            const name = sanitizePath(routeSetup?.name || routePath).replace(/\/+$/, "")

            const importPath = routeSetup?.file
              ? sanitizePath(routeSetup.file.replace(/\.[^.]+$/, ""))
              : join(apiDir, name)

            const importName = importPath.replace(/\W/g, "_")

            // path should start with a slash
            const path = join("/", name)

            const suffix = routeSetup?.file
              ? routeSetup.file.replace(/.+(\.[^.]+)$/, "$1")
              : /\/$/.test(routePath)
                  ? "/index.ts"
                  : ".ts"

            const file = rootPath(importPath + suffix)

            const meta = JSON.stringify(routeSetup?.meta || {})

            const serialized = JSON.stringify({
              name,
              path,
            })

            routeMap[path] = {
              name,
              importName,
              path,
              importPath,
              file,
              meta,
              serialized,
            }

            if (!await fsx.pathExists(file)) {

              const template = routeSetup?.template
                ? await readTemplate(routeSetup?.template)
                : templates.route

              const content = render(template, {
                ...routeSetup,
                ...routeMap[path],
              })

              await fsx.outputFile(file, content, "utf8")

            }

            watchMap.apiFiles[file] = generateFetchModules

          }

        }

        watchMap.srcFiles[filePath] = watchHandler

        await watchHandler()

      }

    }

    await generateBaseFiles()
    await generateFetchModules()

  }

  return {

    name: "vite-plugin-appril-api",

    resolveId(id) {
      if (virtualModules.fetch[id]) {
        return id
      }
    },

    load(id) {
      if (virtualModules.fetch[id]) {
        return {
          code: virtualModules.fetch[id],
          map: null,
        }
      }
    },

    transform(src, id) {
      if (virtualModules.fetch[id]) {
        return transform(src, {
          loader: "ts",
        })
      }
    },

    configResolved,

    configureServer(server) {

      for (const map of Object.values(watchMap)) {
        server.watcher.add(Object.keys(map))
      }

      server.watcher.on("change", async (file) => {

        if (watchMap.tplFiles[file]) {

          // 001: updating templates
          await watchMap.tplFiles[file]()

          // 002: updating routeMap
          for (const handler of Object.values(watchMap.srcFiles)) {
            await handler()
          }

          // 003: regenerating base files
          await generateBaseFiles()

        }
        else if (watchMap.srcFiles[file]) {

          // 001: updating routeMap
          await watchMap.srcFiles[file]()

          // 002: regenerating base files
          await generateBaseFiles()

          // 003: regenerating fetch modules
          await generateFetchModules()

        }
        else {

          for (const map of [
            watchMap.apiFiles,
          ]) {
            if (map[file]) {
              await map[file]()
            }
          }

        }

      })

    },

  }

}

