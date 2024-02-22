
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

import { baseurl, apiurl } from "{{sourceFolder}}/config";

{{#importStringifyFrom}}
import { stringify } from "{{importStringifyFrom}}";
{{/importStringifyFrom}}

import {
  join, useFetchFactory, stringifyParams,
  {{^importStringifyFrom}}
  stringify,
  {{/importStringifyFrom}}
} from "{{fetchModuleBase}}";

{{#typeDeclarations}}
{{text}}
{{/typeDeclarations}}

let name = "{{name}}";
let path = "{{path}}";
let base = join(baseurl, apiurl, path);

let apiFactory = (api: FetchMapper) => {

  {{#fetchDefinitions}}
  {{#overloads}}
  function {{method}}(
    {{paramsType.name}}: {{paramsType.text}},
    {{payloadType.name}}: import("{{fetchModuleBase}}").MaybeRef<{{payloadType.text}}>,
  ): Promise<{{bodyType}}>;
  {{/overloads}}
  function {{method}}(...args: unknown[]): Promise<{{bodyType}}> {
    return api.{{method}}(stringifyParams(args[0]), args[1] || {})
  }
  {{/fetchDefinitions}}

  function useFetch(opts?: UseFetchOptions) {

    {{#fetchDefinitions}}
    {{#overloads}}
    function {{method}}(
      {{paramsType.name}}: {{paramsType.text}},
      {{payloadType.name}}: import("{{fetchModuleBase}}").MaybeRef<{{payloadType.text}}>,
    ): UseFetchReturn<{{bodyType}}>;
    {{/overloads}}
    function {{method}}(...args: unknown[]): UseFetchReturn<{{bodyType}}> {
      return useFetchFactory(base, "{{method}}", args, opts)
    }
    {{/fetchDefinitions}}

    return {
      {{#fetchDefinitions}}
      {{method}},
      {{/fetchDefinitions}}
    }
  }

  {{#fetchDefinitions}}
  useFetch.{{method}} = useFetch().{{method}}
  {{/fetchDefinitions}}

  return {
    {{#fetchDefinitions}}
    {{method}},
    {{/fetchDefinitions}}
    useFetch,
  }

}

export { name, path, base, apiFactory };

const defaultExport = {
  get name() { return name },
  get base() { return base },
  path: (...args: (string|number)[]) => join(base, ...args),
  createApi: (opts?: Options) => apiFactory(fetch(base, { stringify, ...opts })),
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

      return apiFactory(fetch(base, { stringify }))[prop]

    },
    set: () => false,
  }
) as typeof defaultExport & ReturnType<typeof apiFactory>

