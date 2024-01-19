
import { createServer } from "http";
import { join } from "path";

import { type BuildOptions, type Plugin, context, build } from "esbuild";
import type Koa from "koa";

export function esbuilderFactory(
  config: BuildOptions,
  opt: {
    apiDir: string;
    outDir: string;
  },
) {

  const { apiDir, outDir } = opt

  const setupWatcher = async () => {

    const outfile = join(outDir, "dev.js")

    const server = createServer((req, res) => callback?.(req, res))

    let callback: ReturnType<InstanceType<typeof Koa>["callback"]>

    const hmrHandler: Plugin = {
      name: "hmr-handler",
      setup(build) {
        build.onEnd(
          async () => {

            delete require.cache[outfile]

            const { app, listen } = require(outfile)

            if (!callback) {
              listen(server)
            }

            callback = app.callback()

          }
        )
      },
    }

    const ctx = await context({
      logLevel: "info",
      ...config,
      entryPoints: [
        join(apiDir, "_server_watch.ts"),
      ],
      plugins: [
        ...config.plugins || [],
        hmrHandler,
      ],
      outfile,
    })

    await ctx.watch()

  }

  return {

    build: () => build({
      ...config,
      entryPoints: [
        join(apiDir, "_server.ts"),
      ],
      outfile: join(outDir, "index.js"),
    }),

    watch: setupWatcher,

  }

}

