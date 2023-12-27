
import {
  type Options,
  type FetchMapper,
  fetch,
} from "@appril/more/fetch";

import type { PathChunk } from "~/helpers/url";
import { join, urlBuilder } from "~/helpers/url";

import { baseurl, apiurl } from "{{sourceFolder}}/config";

{{#fetchTypes}}
{{.}}
{{/fetchTypes}}

let name = "{{name}}"
let path = "{{path}}"

const base = join(baseurl, apiurl, path)

let apiFactory = function apiFactory(api: FetchMapper) {
  {{#fetchEndpoints}}

  {{#entries}}
  function {{method}}(
    {{#args}}
    {{.}},
    {{/args}}
  ): Promise<{{bodyType}}>;
  {{/entries}}
  function {{method}}(...args: unknown[]): Promise<unknown> {
    return api.{{method}}(...args)
  }
  {{/fetchEndpoints}}

  {{#fetchEndpoints.length}}
  return {
    {{#fetchEndpoints}}
    {{method}},
    {{/fetchEndpoints}}
  }
  {{/fetchEndpoints.length}}

  {{^fetchEndpoints.length}}
  return api
  {{/fetchEndpoints.length}}

}

export { name, path, apiFactory }

const defaultExport = {
  get name() { return name },
  get base() { return base },
  path: (...args: PathChunk[]) => urlBuilder(base, ...args),
  withOptions: (opts: Options) => apiFactory(fetch(base, opts)),
}

export default new Proxy(
  defaultExport,
  {
    get(target, prop) {

      if (prop in target) {
        return typeof target[prop] === "function"
          ? function(this: any) { return target[prop].apply(this, arguments) }
          : target[prop]
      }

      return apiFactory(fetch(base))[prop]

    },
    set: () => false,
  }
) as typeof defaultExport & ReturnType<typeof apiFactory>

