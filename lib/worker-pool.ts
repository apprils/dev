import { join } from "path";
import { Worker, isMainThread, parentPort } from "worker_threads";

import * as apiGenerator from "./api-generator/workers";
import * as apiAssets from "./api-assets/workers";
import * as fetchGenerator from "./fetch-generator/workers";
import * as viewsGenerator from "./views-generator/workers";

export let worker: InstanceType<typeof Worker> | undefined;

export const workerPool = {
  apiGenerator,
  apiAssets,
  fetchGenerator,
  viewsGenerator,
} as const;

if (isMainThread) {
  worker = new Worker(join(__dirname, "worker.js"));

  worker.on("exit", (code) => {
    console.error(`\nWorker Exited with code ${code}`);
    worker = undefined;
  });

  for (const [pool, workers] of Object.entries(workerPool)) {
    // @ts-expect-error
    workerPool[pool] = Object.keys(workers).reduce(
      (map: Record<string, (data: unknown) => void>, task) => {
        map[task] = (data) => worker?.postMessage({ pool, task, data });
        return map;
      },
      {},
    );
  }
} else {
  parentPort?.on("message", async (msg) => {
    const { pool, task, data } = msg;
    // @ts-expect-error
    await workerPool[pool]?.[task]?.(data);
  });
}
