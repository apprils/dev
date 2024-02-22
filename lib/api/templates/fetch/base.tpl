
import qs from "qs";

export type MaybeRef<T> = import("vue").Ref<T> | T;

export function join(...args: unknown[]): string {
  return args
    .filter((e) => e)
    .join("/")
    .replace(/\/+/g, "/");
}

export function stringify(query?: object): string {
  return qs.stringify(query || {}, {
    arrayFormat: "brackets",
    indices: false,
  });
}

export function stringifyParams(params?: object | string): string {
  return typeof params === "string"
    ? params
    : join(...Object.values(params || {}))
}

export function useFetchFactory(
  base: string,
  method: string,
  args: unknown[],
  opts?: UseFetchOptions,
) {
  const path = join(base, stringifyParams(args[0]))
  return method === "get"
    ? useFetch(`${path}?${stringify(args[1])}`, opts)
    : useFetch(path, opts)[method === "del" ? "delete" : method](args[1])
}

