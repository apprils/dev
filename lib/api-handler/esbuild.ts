import { createServer } from "node:http";
import { join } from "node:path";

import type Koa from "koa";
import { type BuildOptions, type Plugin, context, build } from "esbuild";

export function esbuildHandler(
  config: BuildOptions,
  assets: {
    sourceFolder: string;
    apiDir: string;
    outDir: string;
    flushPatterns?: RegExp[];
  },
) {
  const { sourceFolder, apiDir, outDir } = assets;

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
      plugins: [...(config.plugins || []), hmrHandler],
      outfile,
    });

    await ctx.watch();
  };

  return {
    watch,
    build: async () => {
      await build({
        ...config,
        bundle: true,
        entryPoints: [join(sourceFolder, apiDir, "_server.ts")],
        plugins: [...(config.plugins || [])],
        outfile: join(outDir, "index.js"),
      });
    },
  };
}
