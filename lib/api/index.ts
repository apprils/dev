
import { basename, resolve, join } from "path";
import { readFile } from "fs/promises";

import { glob } from "glob";
import type { Plugin, ResolvedConfig } from "vite";
import fsx from "fs-extra";
import { parse } from "yaml";

import { BANNER, render } from "../render";
import { sanitizePath } from "../base";

import routeTpl from "./templates/route.tpl";
import routesTpl from "./templates/routes.tpl";
import fetchTpl from "./templates/fetch.tpl";
import urlmapTpl from "./templates/urlmap.tpl";

import type { ExtraFileSetup, ExtraFileEntry } from "../@types";

const defaultTemplates = {
  route: routeTpl,
  routes: routesTpl,
  fetch: fetchTpl,
  urlmap: urlmapTpl,
}

type TemplateName = keyof typeof defaultTemplates
type TemplateMap = Record<TemplateName | string, string>

type Options = {
  apiDir: string,
  sourceFiles: string | string[];
  extraFiles: Record<string, ExtraFileSetup>,
  templates: Partial<TemplateMap>,
}

type RouteSetup = {
  meta?: Record<string, any>;
  template?: string;
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
export function vitePluginApprilApi(
  opts: Partial<Options> = {},
): Plugin {

  const {
    apiDir = "api",
    sourceFiles = "**/*_routes.yml",
    extraFiles = {},
  } = opts

    // adding custom templates and extraFiles templates to watchlist
  const watchedFiles = [
    ...Object.values({ ...opts.templates }),
    ...Object.values(extraFiles).map((e) => typeof e === "string" ? e : e.template),
  ] as string[]

  async function generateFiles({ root }: ResolvedConfig) {

    const rootPath = (...path: string[]) => resolve(root, join(...path))

    const sourceFolder = basename(root)

    // re-reading files every time

    const customTemplates: Record<string, string> = {}

    const readTemplate = async (tpl: string) => {
      return tpl in customTemplates
        ? customTemplates[tpl]
        : customTemplates[tpl] = await readFile(/^\//.test(tpl) ? tpl : rootPath(tpl), "utf8")
    }

    const templates: TemplateMap = { ...defaultTemplates }

    for (const [ name, file ] of Object.entries({ ...opts.templates })) {
      templates[name as TemplateName] = await readTemplate(file as string)
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

        if (!watchedFiles.includes(filePath)) {
          watchedFiles.push(filePath)
        }

      }

    }

    const routes = []

    for (const [ routePath, routeSetup ] of routeEntries) {

      const importPath = sanitizePath(routePath).replace(/\/+$/, "")

      const suffix = /\/$/.test(routePath)
        ? "/index.ts"
        : ".ts"

      // path should start with a slash
      const path = join("/", importPath.replace(/^index$/, ""))

      const route = {
        name: importPath,
        path,
        meta: JSON.stringify("meta" in routeSetup ? routeSetup.meta : {}),
        importName: importPath.replace(/\W/g, "_"),
        importPath,
        file: importPath + suffix,
      }

      const serialized = JSON.stringify({
        name: route.name,
        path: route.path,
      })

      routes.push({ ...route, serialized })

      const routeFile = rootPath(apiDir, route.file)

      if (!await fsx.pathExists(routeFile)) {

        const template = routeSetup.template
          ? await readTemplate(routeSetup.template)
          : templates.route

        const content = render(template, { ...routeSetup, ...route })

        await fsx.outputFile(routeFile, content, "utf8")

      }

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
      [ rootPath("fetch.ts"), templates.fetch ],
    ]) {

      const content = render(template, {
        BANNER,
        apiDir,
        sourceFolder,
        routes,
      })

      await fsx.outputFile(outfile, content, "utf8")

    }

  }

  return {

    name: "vite-plugin-appril-api",

    configResolved: generateFiles,

    configureServer(server) {

      if (watchedFiles.length) {

        server.watcher.add(watchedFiles)

        server.watcher.on("change", function(file) {
          if (watchedFiles.some((path) => file.includes(path))) {
            return generateFiles(server.config)
          }
        })

      }

    },

  }

}

