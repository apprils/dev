import { readFile } from "fs/promises";

import type { Plugin, ResolvedConfig } from "vite";

import { resolvePath } from "../../base";
import { BANNER, renderToFile } from "../../render";

import envTpl from "./templates/env.tpl";
import indexTpl from "./templates/index.tpl";
import pluginTpl from "./templates/plugin.tpl";

const defaultTemplates = {
  plugin: pluginTpl,
  env: envTpl,
  index: indexTpl,
};

type PluginDefinition = {
  pluginName?: string;
  globalPropertiesPrefix?: string;
  globalProperties?: { [key: string]: any };
};

type Options = {
  plugins: Record<string, PluginDefinition>;
  outDir?: string;
  templates?: Partial<TemplateMap>;
};

type TemplateName = keyof typeof defaultTemplates;
type TemplateMap = Record<TemplateName, string>;

export default function globalPluginsGenerator(opts: Options): Plugin {
  const {
    plugins,
    outDir = "plugins/generated/global",
    templates: optedTemplates = {},
  } = { ...opts };

  async function generateFiles({ root }: ResolvedConfig) {
    // re-reading templates every time

    const templates: TemplateMap = { ...defaultTemplates };

    for (const [name, file] of Object.entries(optedTemplates)) {
      templates[name as TemplateName] = await readFile(
        resolvePath(file),
        "utf8",
      );
    }

    const generatedPlugins: {
      pluginName: string;
      globalProperties: { name: string; globalName: string }[];
    }[] = [];

    for (const [
      path,
      { pluginName: optedName, globalPropertiesPrefix = "", globalProperties },
    ] of Object.entries(plugins)) {
      if (!globalProperties) {
        continue;
      }

      const pluginName = optedName ? optedName : path.replace(/\W/g, "_");

      const globalPropertiesNames = Object.entries(globalProperties).map(
        ([name, prop]) => {
          return {
            name,
            globalName:
              name === "default"
                ? globalPropertiesPrefix + prop
                : globalPropertiesPrefix + name,
          };
        },
      );

      await renderToFile(
        resolvePath(outDir, pluginName + ".ts"),
        templates.plugin,
        {
          BANNER,
          path,
          pluginName,
          globalProperties: globalPropertiesNames,
          template: optedTemplates.plugin,
        },
      );

      generatedPlugins.push({
        pluginName,
        globalProperties: globalPropertiesNames,
      });
    }

    await renderToFile(resolvePath(outDir, "env.d.ts"), templates.env, {
      BANNER,
      generatedPlugins,
      template: optedTemplates.env,
    });

    await renderToFile(resolvePath(outDir, "index.ts"), templates.index, {
      BANNER,
      generatedPlugins,
      template: optedTemplates.index,
    });
  }

  return {
    name: "vite-plugin-vue-plugins-global",

    configResolved: generateFiles,

    configureServer(server) {
      // adding templates to watchlist

      const watchedFiles = [...Object.values(optedTemplates)];

      if (watchedFiles.length) {
        server.watcher.add(watchedFiles);

        server.watcher.on("change", function (file: any) {
          if (watchedFiles.some((path) => file.includes(path))) {
            return generateFiles(server.config);
          }
        });
      }
    },
  };
}
