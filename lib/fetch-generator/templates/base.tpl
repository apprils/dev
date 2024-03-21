import { type MaybeRef, serialize, stringify } from "{{sourceFolder}}/../helpers/fetch";

export type { MaybeRef };

export { fetch as fetchFactory } from "@appril/more/fetch";

export { baseurl, apiurl } from "{{sourceFolder}}/config";

export const fetchOptions = {
  ...serialize ? { serialize } : {},
  ...stringify ? { stringify } : {},
}

export function join(...args: unknown[]): string {
  return args
    .filter((e) => e)
    .join("/")
    .replace(/\/+/g, "/");
}

export function stringifyParams(params?: object | string): string {
  return typeof params === "string"
    ? params
    : join(...Object.values(params || {}))
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
