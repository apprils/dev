import { join } from "path";

import { type Plugin } from "vite";
import { glob } from "glob";
import { watch } from "chokidar";
import fsx from "fs-extra";

import { resolvePath, GENERATED_FILES_TMPDIR } from "../base";

export async function generatedFilesHandler(o: {
  appendTo: string;
}): Promise<Plugin>;

export async function generatedFilesHandler(
  h: (entries: string[]) => Promise<void>,
): Promise<Plugin>;

export async function generatedFilesHandler(...args: any[]): Promise<Plugin> {
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

  if (typeof args[0] === "function") {
    handler = args[0];
  } else if (args[0]?.appendTo) {
    handler = (entries) =>
      appendToHandler(
        /^\//.test(args[0].appendTo)
          ? args[0].appendTo
          : resolvePath(args[0].appendTo),
        entries,
      );
  }

  return {
    name: "generated-files-handler",
    async configureServer() {
      // somehow server.watcher does not work with arbitrary folders
      // that initially are empty; so using bare chokidar watcher

      // watched root should exist before watcher created
      await fsx.ensureDir(GENERATED_FILES_TMPDIR);

      const watchGlob = join(GENERATED_FILES_TMPDIR, "**/*");
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
