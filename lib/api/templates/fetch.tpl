{{BANNER}}

import type { Options, FetchMapper } from "@appril/more/fetch";
import { fetch } from "@appril/more/fetch";

import type { PathChunk } from "~/helpers/url";
import { join, urlBuilder } from "~/helpers/url";

import { baseurl, apiurl } from "{{sourceFolder}}/config";

const routeMap = {
{{#routes}}
  "{{importPath}}": { name: "{{name}}", path: "{{path}}" },
{{/routes}}
}

export default function fetchWrapper(
  routeKey: keyof typeof routeMap,
  options?: Options,
): FetchMapper & {
  name: string;
  base: string;
  path: (...args: PathChunk[]) => string;
} {

  const { name, path } = routeMap[routeKey]
  const base = join(baseurl, apiurl, path)

  const wrapper = options
    ? fetch(base, options)
    : fetch(base)

  return {
    get name() { return name },
    get base() { return base },
    path: (...args: PathChunk[]) => urlBuilder(base, ...args),
    ...wrapper,
  }

}

