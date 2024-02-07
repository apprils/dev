
import {
  type Options,
  type FetchMapper,
  fetch,
} from "@appril/more/fetch";

import {
  type UseFetchReturn,
  type UseFetchOptions,
  useFetch,
} from "@vueuse/core";

import {
  type PathChunk,
  join,
  urlBuilder,
} from "~/helpers/url";

import { baseurl, apiurl } from "{{sourceFolder}}/config";
import { useMethodArgsMapper } from "{{fetchBaseModule}}";

{{#typeDeclarations}}
{{text}}
{{/typeDeclarations}}

let name = "{{name}}"
let path = "{{path}}"

const base = join(baseurl, apiurl, path)

let apiFactory = function apiFactory(api: FetchMapper) {
  {{#endpoints}}

  {{#overloads}}
  function {{method}}(
    {{#renderedParams}}
    {{.}},
    {{/renderedParams}}
  ): Promise<{{bodyType}}>;
  function {{useMethod}}(
    {{#renderedParams}}
    {{.}},
    {{/renderedParams}}
  ): UseFetchReturn<{{bodyType}}>;
  function {{useMethod}}(
    {{#renderedParams}}
    {{.}},
    {{/renderedParams}}
    useFetchOptions?: UseFetchOptions,
  ): UseFetchReturn<{{bodyType}}>;
  {{/overloads}}
  function {{method}}(...args: unknown[]): Promise<unknown> {
    return api.{{method}}(...args)
  }
  function {{useMethod}}(...args: unknown[]): Promise<unknown> {
    const [ apiArgs, useFetchOptions ] = useMethodArgsMapper(args)
    return useFetch(urlBuilder(base, ...apiArgs), { method: "{{httpMethod}}" }, useFetchOptions)
  }
  {{/endpoints}}

  {{#endpoints.length}}
  return {
    {{#endpoints}}
    {{method}},
    {{useMethod}},
    {{/endpoints}}
  }
  {{/endpoints.length}}

  {{^endpoints.length}}
  return api
  {{/endpoints.length}}

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

