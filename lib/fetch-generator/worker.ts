import { join } from "path";
import { parentPort } from "worker_threads";

import { extractApiAssets } from "../ast";
import { filesGeneratorFactory } from "../base";

import enhancedTpl from "./templates/enhanced.tpl";
import simpleTpl from "./templates/simple.tpl";
import baseTpl from "./templates/base.tpl";
import indexTpl from "./templates/index.tpl";

import type { WorkerData } from "./@types";

parentPort?.on(
  "message",
  async ({ generateRouteAssets, generateIndexFiles, fetchDir }: WorkerData) => {
    const { generateFile } = filesGeneratorFactory();

    if (generateRouteAssets) {
      const { route, root, base } = generateRouteAssets;

      const { typeDeclarations, fetchDefinitions } = await extractApiAssets(
        route.file,
        {
          root,
          base,
        },
      );

      await generateFile(join(fetchDir, `${route.name}.ts`), {
        template: fetchDefinitions ? enhancedTpl : simpleTpl,
        context: { ...route, typeDeclarations, fetchDefinitions },
      });
    }

    if (generateIndexFiles) {
      const { sourceFolder, importStringifyFrom, routes } = generateIndexFiles;

      await generateFile(join(fetchDir, "@base.ts"), {
        template: baseTpl,
        context: {
          sourceFolder,
          importStringifyFrom,
        },
      });

      await generateFile(join(fetchDir, "@index.ts"), {
        template: indexTpl,
        context: {
          routes,
        },
      });
    }
  },
);
