import { join } from "path";
import { Worker, isMainThread, parentPort } from "worker_threads";

import pkg from "../package.json";
import * as fetchGenerator from "./fetch-generator/worker";

let worker: InstanceType<typeof Worker> | undefined;

if (isMainThread) {
  worker = new Worker(join(__dirname, "worker.js"));
  worker.on("exit", (code) => {
    console.error(`\n[ ${pkg.name} ]: Worker Exited with code ${code}`);
    worker = undefined;
  });
}

const workerMap = {} as { fetchGenerator: typeof fetchGenerator };

for (const [pool, workers] of Object.entries({ fetchGenerator })) {
  // @ts-ignore
  workerMap[pool] = Object.keys(workers).reduce(
    (map: Record<string, (data: unknown) => void>, task) => {
      if (isMainThread) {
        map[task] = (data) => worker?.postMessage({ pool, task, data });
      } else {
        parentPort?.on("message", async (msg) => {
          if (msg.pool !== pool || msg.task !== task) {
            return;
          }
          // @ts-ignore
          await workers[task](msg.data);
        });
      }
      return map;
    },
    {},
  );
}

export default workerMap;
