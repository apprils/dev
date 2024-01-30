import { basename, join } from "path";
import { readFile } from "fs/promises";

import type { Plugin, ResolvedConfig } from "vite";

import { resolvePath, filesGeneratorFactory } from "../../base";
import { BANNER } from "../../render";

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

const PLUGIN_NAME = "vite-plugin-vue-plugins-global";

export default function globalPluginsGenerator(opts: Options): Plugin {
  const {
    plugins,
    outDir = "plugins/generated/global",
    templates: optedTemplates = {},
  } = { ...opts };

  const sourceFolder = basename(resolvePath());

  const filesGenerator = filesGeneratorFactory();

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

      await filesGenerator.generateFile(join(outDir, pluginName + ".ts"), {
        template: templates.plugin,
        context: {
          BANNER,
          path,
          pluginName,
          globalProperties: globalPropertiesNames,
          template: optedTemplates.plugin,
        },
      });

      generatedPlugins.push({
        pluginName,
        globalProperties: globalPropertiesNames,
      });
    }

    await filesGenerator.generateFile(join(outDir, "env.d.ts"), {
      template: templates.env,
      context: {
        BANNER,
        generatedPlugins,
        template: optedTemplates.env,
      },
    });

    await filesGenerator.generateFile(join(outDir, "index.ts"), {
      template: templates.index,
      context: {
        BANNER,
        generatedPlugins,
        template: optedTemplates.index,
      },
    });
  }

  async function configResolved(config: ResolvedConfig) {
    await generateFiles(config);
    await filesGenerator.persistGeneratedFiles(
      join(sourceFolder, PLUGIN_NAME),
      (f) => join(sourceFolder, f),
    );
  }

  return {
    name: PLUGIN_NAME,

    configResolved,

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
