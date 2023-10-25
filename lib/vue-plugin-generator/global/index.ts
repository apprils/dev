
import { join, resolve } from "path";
import { readFile } from "fs/promises";

import type { Plugin, ResolvedConfig } from "vite";
import fsx from "fs-extra";

import envTpl from "./templates/env.tpl";
import indexTpl from "./templates/index.tpl";
import pluginTpl from "./templates/plugin.tpl";

import { BANNER, render } from "../../render";

const defaultTemplates = {
  plugin: pluginTpl,
  env: envTpl,
  index: indexTpl,
}

type PluginDefinition = {
  pluginName?: string,
  globalPropertiesPrefix?: string,
  globalProperties?: { [key: string]: any },
}

type Options = {
  plugins: Record<string, PluginDefinition>,
  outDir?: string,
  templates?: Partial<TemplateMap>,
}

type TemplateName = keyof typeof defaultTemplates
type TemplateMap = Record<TemplateName, string>

export function vitePluginVuePluginsGlobal(
  {
    plugins,
    outDir = "plugins/generated/global",
    templates: optedTemplates = {},
  }: Options,
): Plugin {

  async function generateFiles({ root }: ResolvedConfig) {

    const rootPath = (...path: string[]) => resolve(root, join(...path))

    // re-reading templates every time

    const templates: TemplateMap = { ...defaultTemplates }

    for (const [ name, file ] of Object.entries(optedTemplates)) {
      templates[name as TemplateName] = await readFile(rootPath(file), "utf8")
    }

    const generatedPlugins: {
      pluginName: string,
      globalProperties: { name: string, globalName: string }[],
    }[] = []

    for (
      const [
        path,
        {
          pluginName: optedName,
          globalPropertiesPrefix = "",
          globalProperties,
        }
      ]
      of Object.entries(plugins)
    ) {

      if (!globalProperties) {
        continue
      }

      const pluginName = optedName
        ? optedName
        : path.replace(/\W/g, "_")

      const globalPropertiesNames = Object.entries(globalProperties).map(([ name, prop ]) => {
        return {
          name,
          globalName: name === "default"
            ? globalPropertiesPrefix + prop
            : globalPropertiesPrefix + name
        }
      })

      {

        const content = render(templates.plugin, {
          BANNER,
          path,
          pluginName,
          globalProperties: globalPropertiesNames,
          template: optedTemplates.plugin,
        })

        await fsx.outputFile(rootPath(outDir, pluginName + ".ts"), content)

      }

      generatedPlugins.push({ pluginName, globalProperties: globalPropertiesNames })

    }

    {

      const content = render(templates.env, {
        BANNER,
        generatedPlugins,
        template: optedTemplates.env,
      })

      await fsx.outputFile(rootPath(outDir, "env.d.ts"), content)

    }

    {

      const content = render(templates.index, {
        BANNER,
        generatedPlugins,
        template: optedTemplates.index,
      })

      await fsx.outputFile(rootPath(outDir, "index.ts"), content)

    }

  }

  return {

    name: "vite-plugin-vue-plugins-global",

    configResolved: generateFiles,

    configureServer(server) {

      // adding templates to watchlist

      const watchedFiles = [
        ...Object.values(optedTemplates),
      ]

      if (watchedFiles.length) {

        server.watcher.add(watchedFiles)

        server.watcher.on("change", function(file: any) {
          if (watchedFiles.some((path) => file.includes(path))) {
            return generateFiles(server.config)
          }
        })

      }

    }

  }

}

