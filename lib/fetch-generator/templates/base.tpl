
import qs from "qs";
import { useFetch } from "@vueuse/core";
import type { Ref } from "vue";

export { fetch as fetchFactory } from "@appril/more/fetch";

export { baseurl, apiurl } from "{{sourceFolder}}/config";

export type MaybeRef<T> = Ref<T> | {
  [K in keyof T]: Ref<T[K]> | T[K];
};

export function join(...args: unknown[]): string {
  return args
    .filter((e) => e)
    .join("/")
    .replace(/\/+/g, "/");
}

{{#importStringifyFrom}}
export { stringify } from "{{importStringifyFrom}}";
{{/importStringifyFrom}}

{{^importStringifyFrom}}
export function stringify(query?: object): string {
  return qs.stringify(query || {}, {
    arrayFormat: "brackets",
    indices: false,
  });
}
{{/importStringifyFrom}}

export function stringifyParams(params?: object | string): string {
  return typeof params === "string"
    ? params
    : join(...Object.values(params || {}))
}

export function useFetchFactory<T = unknown>(
  base: string,
  method: string,
  args: unknown[],
  opts: import("@vueuse/core").UseFetchOptions = {},
) {
  const path = join(base, stringifyParams(args[0] as object))
  return method === "get"
    ? useFetch<T>(`${path}?${stringify(args[1] as object)}`, opts)
    : useFetch<T>(path, opts)[method === "del" ? "delete" : method as never](args[1])
}

export async function withLoader(
  worker: () => Promise<any>,
  toggler?: (_s?: boolean) => boolean,
) {
  try {
    toggler?.(true)
    return await worker()
  }
  finally {
    toggler?.(false)
  }
}
