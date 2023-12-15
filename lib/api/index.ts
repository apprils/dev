
import { dirname, basename, resolve, join } from "path";
import { readFile } from "fs/promises";

import { glob } from "glob";
import type { Plugin, ResolvedConfig } from "vite";
import fsx from "fs-extra";
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

import type { ExtraFileSetup, ExtraFileEntry } from "../@types";

const defaultTemplates = {
  route: routeTpl,
  routes: routesTpl,
  urlmap: urlmapTpl,
}

type Options = {
  importBase: string;
  apiDir: string;
  fetchFilter: (r: Route) => boolean,
  sourceFiles: string | string[];
  extraFiles: Record<string, ExtraFileSetup>;
  templates: Partial<Record<keyof typeof defaultTemplates, string>>;
}

type Route = {
  name: string;
  importName: string;
  path: string;
  importPath: string;
  file: string;
  meta: string;
  serialized: string;
  fetchModule: string;
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
 *    - {apiDir}/_routes.ts - importing route files and exporting mapped routes
 *    - {apiDir}/{route}.ts (or {apiDir}/{route}/index.ts if path ends in a slash)
 *    - extraFiles, if opted
 *
 * @param {object} [opts={}] - options
 * @param {string} [opts.apiDir="api"] - path to api folder.
 *    where to place generated files
 * @param {string} [opts.sourceFiles="**\/*_routes.yml"] - yaml files glob pattern
 *    files containing route definitions, resolved relative to apiDir
 * @param {object} [opts.extraFiles={}] - an optional map of extra files to be generated.
 *    where key is the file to be generated and value is the template to be used.
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
    extraFiles = {},
  } = opts

  const rootPath = (...path: string[]) => resolve(String(process.env.PWD), join(...path))

  // adding custom templates and extraFiles templates to watchlist
  const watchedFiles = new Set([
    ...Object.values({ ...opts.templates }),
    ...Object.values(extraFiles).map((e) => typeof e === "string" ? e : e.template),
  ])

  const virtualMap: {
    fetch: Record<string, string>;
  } = {
    fetch: {},
  }

  async function generateFiles(
    { root }: ResolvedConfig,
  ) {

    const sourceFolder = basename(root)

    // re-reading files every time

    const readTemplate = (file: string) => readFile(
      /^\//.test(file)
        ? file
        : rootPath(file),
      "utf8"
    )

    const templates = { ...defaultTemplates }

    const templateEntries = Object.entries({ ...opts.templates }) as [
      name: keyof typeof defaultTemplates,
      file: string
    ][]

    for (const [ name, file ] of templateEntries) {
      templates[name] = await readTemplate(file)
    }

    const routeEntries: [ name: string, setup: RouteSetup ][] = []

    for (
      const pattern of Array.isArray(sourceFiles)
        ? [ ...sourceFiles ]
        : [ sourceFiles ]
    ) {

      for (const file of await glob(pattern, { cwd: rootPath(apiDir) })) {

        const filePath = rootPath(apiDir, file)
        const fileContent = await readFile(filePath, "utf8")
        const routeDefinitions = parse(fileContent)

        for (const [ path, setup ] of Object.entries(routeDefinitions)) {
          routeEntries.push([ path, setup || {} ])
        }

        watchedFiles.add(filePath)

      }

    }

    const routes: Route[] = []

    for (const [ routePath, routeSetup ] of routeEntries) {

      const name = sanitizePath(routeSetup.name || routePath).replace(/\/+$/, "")

      const importPath = routeSetup.file
        ? sanitizePath(routeSetup.file.replace(/\.[^.]+$/, ""))
        : join(apiDir, name)

      const importName = importPath.replace(/\W/g, "_")

      // path should start with a slash
      const path = join("/", name)

      const suffix = routeSetup.file
        ? routeSetup.file.replace(/.+(\.[^.]+)$/, "$1")
        : /\/$/.test(routePath)
            ? "/index.ts"
            : ".ts"

      const file = rootPath(importPath + suffix)

      const meta = JSON.stringify(
        "meta" in routeSetup
          ? routeSetup.meta
          : {}
      )

      const serialized = JSON.stringify({
        name,
        path,
      })

      const route: Route = {
        name,
        importName,
        path,
        importPath,
        file,
        meta,
        serialized,
        fetchModule: "",
      }

      if (!await fsx.pathExists(route.file)) {

        const template = routeSetup.template
          ? await readTemplate(routeSetup.template)
          : templates.route

        const content = render(template, {
          ...routeSetup,
          ...route,
        })

        await fsx.outputFile(route.file, content, "utf8")

      }

      if (fetchFilter(route)) {

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

        virtualMap.fetch[`fetch:${ route.name }`] = route.fetchModule

      }

      routes.push(route)

    }

    const perRouteExtraFiles: ExtraFileEntry[] = []
    const globalExtraFiles: ExtraFileEntry[] = []

    for (const [ outfile, setup ] of Object.entries(extraFiles)) {

      const { template: tplfile, overwrite } = typeof setup === "string"
        ? { template: setup, overwrite: true }
        : setup

      const template = await readFile(rootPath(tplfile), "utf8")

      if (/\{\{.+\}\}/.test(outfile)) {
        perRouteExtraFiles.push({ outfile, template, overwrite })
      }
      else {
        globalExtraFiles.push({ outfile, template, overwrite })
      }

    }

    for (const { outfile, template, overwrite } of perRouteExtraFiles) {

      for (const route of routes) {

        const file = rootPath(render(outfile, route))

        if (await fsx.pathExists(file) && !overwrite) {
          continue
        }

        const content = render(template, {
          importBase,
          sourceFolder,
          route,
          routes,
        })

        await fsx.outputFile(file, content, "utf8")

      }

    }

    for (const { outfile, template, overwrite } of globalExtraFiles) {

      if (await fsx.pathExists(outfile) && !overwrite) {
        continue
      }

      const content = render(template, {
        sourceFolder,
        routes,
      })

      await fsx.outputFile(outfile, content, "utf8")

    }

    for (const [ outfile, template ] of [
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

      await fsx.outputFile(outfile, content, "utf8")

    }

    {

      const fetchRoutes = routes.filter(fetchFilter)

      const content = render(fetchIndexTpl, {
        BANNER,
        importBase,
        apiDir,
        sourceFolder,
        routes: fetchRoutes,
      })

      await fsx.outputFile(rootPath("fetch.d.ts"), content, "utf8")

      virtualMap.fetch["fetch:"] = render(fetchVirtualIndexTpl, {
        importBase,
        apiDir,
        sourceFolder,
        routes: fetchRoutes,
      })

    }

  }

  return {

    name: "vite-plugin-appril-api",

    resolveId(id) {
      if (virtualMap.fetch[id]) {
        return id
      }
    },

    load(id) {
      if (virtualMap.fetch[id]) {
        return {
          code: virtualMap.fetch[id],
          map: null,
        }
      }
    },

    transform(src, id) {
      if (virtualMap.fetch[id]) {
        return transform(src, {
          loader: "ts",
        })
      }
    },

    configResolved: generateFiles,

    configureServer(server) {

      const files = [ ...watchedFiles ]

      if (files.length) {

        server.watcher.add(files)

        server.watcher.on("change", function(file) {
          if (files.some((path) => file.includes(path))) {
            return generateFiles(server.config)
          }
        })

      }

    },

  }

}

