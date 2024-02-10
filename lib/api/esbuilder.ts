import { createServer } from "http";
import { dirname, join } from "path";

import type Koa from "koa";
import { type ResolvedConfig } from "vite";
import { type BuildOptions, type Plugin, context, build } from "esbuild";
import { generate as tsToZod } from "ts-to-zod";
import fsx from "fs-extra";

import type { TypeDeclaration } from "./@types";
import { resolvePath } from "../base";
import { BANNER, render } from "../render";
import { extractTypedEndpoints } from "./ast";

import schemaSourceTpl from "./templates/schema/source.tpl";
import schemaModuleTpl from "./templates/schema/module.tpl";

export function esbuilderFactory(
  config: BuildOptions,
  assets: {
    sourceFolder: string;
    apiDir: string;
    outDir: string;
    alias: ResolvedConfig["resolve"]["alias"];
    flushPatterns?: RegExp[];
  },
) {
  const { sourceFolder, apiDir, outDir } = assets;

  const schemaValidator: Plugin = {
    name: "schemaValidator",
    setup(build) {
      const filter = new RegExp(`${sourceFolder}:(.+):schema`);
      const namespace = "@appril/schemaValidator";

      build.onResolve({ filter }, ({ path }) => {
        return {
          path,
          namespace,
        };
      });

      build.onLoad({ filter, namespace }, async ({ path }) => {
        const file = resolvePath(path.replace(filter, "$1"));
        const fileContent = await fsx.readFile(file, "utf8");

        const { typeDeclarations, payloadParams } = extractTypedEndpoints(
          fileContent,
          {
            root: sourceFolder,
            base: dirname(file.replace(resolvePath(), "")),
          },
        );

        if (!payloadParams.length) {
          return {
            loader: "ts",
            contents: "export default []",
          };
        }

        const typeDeclarationsMapper = async ({
          text,
          importDeclaration,
        }: TypeDeclaration) => {
          if (!importDeclaration) {
            return text;
          }

          const file = await tryResolveFile(
            importDeclaration.path,
            assets.alias,
          );

          return file ? fsx.readFile(file, "utf8") : text;
        };

        const sourceText = render(schemaSourceTpl, {
          fileContent,
          typeDeclarations: await Promise.all(
            typeDeclarations.map(typeDeclarationsMapper),
          ),
          payloadParams,
        });

        if (path.endsWith("-source")) {
          return {
            loader: "ts",
            resolveDir: resolvePath(),
            contents: sourceText,
          };
        }

        const { getZodSchemasFile, errors } = tsToZod({
          sourceText,
          // biome-ignore format:
          nameFilter: (id) => payloadParams.some((e) => e.id === id || e.type === id),
          getSchemaName: (e) => e,
        });

        return {
          loader: "ts",
          resolveDir: resolvePath(),
          contents: render(schemaModuleTpl, {
            BANNER,
            typeDeclarations,
            tsToZod: errors.length ? "" : getZodSchemasFile(`${path}-source`),
            payloadParams,
            errors,
          }),
        };
      });
    },
  };

  const watch = async () => {
    const outfile = join(outDir, "dev.js");

    const server = createServer((req, res) => callback?.(req, res));

    let callback: ReturnType<InstanceType<typeof Koa>["callback"]>;

    const hmrHandler: Plugin = {
      name: "hmrHandler",
      setup(build) {
        const flushPatterns = [
          /@appril\/core/,
          ...(assets.flushPatterns || []),
        ];

        const flushFilter = (id: string) => {
          return id === outfile || flushPatterns.some((e) => e.test(id));
        };

        build.onEnd(async () => {
          for (const id of Object.keys(require.cache).filter(flushFilter)) {
            delete require.cache[id];
          }

          const { app, listen } = require(outfile);

          if (!callback) {
            listen(server);
          }

          callback = app.callback();
        });
      },
    };

    const ctx = await context({
      logLevel: "info",
      ...config,
      bundle: true,
      entryPoints: [join(sourceFolder, apiDir, "_server_watch.ts")],
      plugins: [...(config.plugins || []), schemaValidator, hmrHandler],
      outfile,
    });

    await ctx.watch();
  };

  return {
    build: () =>
      build({
        ...config,
        bundle: true,
        entryPoints: [join(sourceFolder, apiDir, "_server.ts")],
        plugins: [...(config.plugins || []), schemaValidator],
        outfile: join(outDir, "index.js"),
      }),

    watch,
  };
}

async function tryResolveFile(
  path: string,
  alias: ResolvedConfig["resolve"]["alias"],
) {
  const matchedAlias = alias.find((e) => {
    return typeof e.find === "string"
      ? path.startsWith(`${e.find}/`)
      : e.find.test(path);
  });

  const resolvedPath = matchedAlias
    ? path.replace(matchedAlias.find, matchedAlias.replacement)
    : path;

  for (const ext of [".ts", "/index.ts"]) {
    if (await fsx.pathExists(resolvedPath + ext)) {
      return resolvedPath + ext;
    }
  }
}
