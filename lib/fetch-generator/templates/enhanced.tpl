import {
  baseurl, apiurl,
  fetchFactory, fetchOptions,
  join, stringifyParams, withLoader,
} from "@fetch/../base";

{{#typeDeclarations}}
{{text}}
{{/typeDeclarations}}

export const name = "{{name}}";
export const base = join(baseurl, apiurl, "{{path}}");

const apiFactory = (
  api: import("@appril/more/fetch").FetchMapper,
) => {

  {{#fetchDefinitions}}
  {{#overloads}}
  function {{method}}(
    {{paramsType.name}}: {{paramsType.text}},
    {{payloadType.name}}: import("@fetch/../base").MaybeRef<
      {{payloadType.text}}
    >,
  ): Promise<{{bodyType}}>;
  {{/overloads}}
  function {{method}}(
    ...args: unknown[]
  ): Promise<{{bodyType}}> {
    return api.{{method}}(stringifyParams(args[0] as object), args[1] || {})
  }
  {{/fetchDefinitions}}

  return {
    {{#fetchDefinitions}}
    {{method}},
    {{/fetchDefinitions}}
  }
}

export const createApi = (
  options?: import("@appril/more/fetch").Options,
) => apiFactory(fetchFactory(base, { ...fetchOptions, ...options }));

export const fetch = createApi()

{{#fetchDefinitions}}
export const {{method}} = fetch.{{method}};
{{/fetchDefinitions}}

export { withLoader };

export default {
  {{#fetchDefinitions}}
  {{method}}: fetch.{{method}},
  {{/fetchDefinitions}}
  get name() { return name },
  get base() { return base },
  createApi,
  fetch,
  withLoader,
};
