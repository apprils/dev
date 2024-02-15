import { join } from "path";

import { type Plugin } from "vite";
import { glob } from "glob";
import { watch } from "chokidar";
import fsx from "fs-extra";

import { resolvePath, GENERATED_FILES_DIR } from "../base";

type Options = { appendTo: string };

type CustomHandler = (entries: string[]) => Promise<void>;

export async function generatedFilesHandler(o: Options): Promise<Plugin>;

export async function generatedFilesHandler(h: CustomHandler): Promise<Plugin>;

export async function generatedFilesHandler(
  arg: Options | CustomHandler,
): Promise<Plugin> {
  const appendToHandler = async (appendTo: string, entries: string[]) => {
    const lines: string[] = [];

    if (await fsx.pathExists(appendTo)) {
      const content = await fsx.readFile(appendTo, "utf8");
      lines.push(...content.split("\n"));
    }

    for (const line of entries) {
      lines.includes(line) || lines.push(line);
    }

    await fsx.outputFile(appendTo, lines.join("\n"), "utf8");
  };

  let handler: (e: string[]) => Promise<void> = async () => {};

  if (typeof arg === "function") {
    handler = arg;
  } else if (typeof arg === "object") {
    handler = (entries) =>
      appendToHandler(
        /^\//.test(arg.appendTo) ? arg.appendTo : resolvePath(arg.appendTo),
        entries,
      );
  }

  return {
    name: "generated-files-handler",
    async configureServer({ config }) {
      // somehow server.watcher does not work with arbitrary folders
      // that initially are empty; so using bare chokidar watcher

      const watchDir = join(config.cacheDir, GENERATED_FILES_DIR);

      // watchDir should exist before watcher created
      await fsx.ensureDir(watchDir);

      const watchGlob = join(watchDir, "**/*");
      const queue: string[] = [];
      const eventHandler = (file: string) => queue.push(file);

      for (const entry of await glob(watchGlob, { withFileTypes: true })) {
        // glob also returns folders, we need only files
        if (entry.isFile()) {
          queue.push(entry.fullpath());
        }
      }

      const watcher = watch(watchGlob, {
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 500,
        },
      });

      watcher.on("error", console.error);
      watcher.on("add", eventHandler);
      watcher.on("change", eventHandler);

      setInterval(async () => {
        const files = queue.splice(0);
        const entries: string[] = [];

        for (const file of files) {
          try {
            const fileContent = await fsx.readFile(file, "utf8");
            entries.push(...fileContent.split("\n"));
          } catch (e) {
            console.error(e);
          }
        }

        if (!entries.length) {
          return;
        }

        await handler(entries);
      }, 5000);
    },
  };
}
