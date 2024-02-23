
import qs from "qs";
import { useFetch } from "@vueuse/core";

export { fetch as fetchFactory } from "@appril/more/fetch";

export { baseurl, apiurl } from "{{sourceFolder}}/config";

export type MaybeRef<T> = import("vue").Ref<T> | T;

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

export function useFetchFactory(
  base: string,
  method: string,
  args: unknown[],
  opts: import("@vueuse/core").UseFetchOptions = {},
) {
  const path = join(base, stringifyParams(args[0] as object))
  return method === "get"
    ? useFetch(`${path}?${stringify(args[1] as object)}`, opts)
    : useFetch(path, opts)[method === "del" ? "delete" : method](args[1])
}

