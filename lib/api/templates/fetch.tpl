{{BANNER}}

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

export function apiFactory(api: FetchMapper) {
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

const base = join(baseurl, apiurl, "{{path}}")

export default {
  get name() { return "{{name}}" },
  get base() { return base },
  path: (...args: PathChunk[]) => urlBuilder(base, ...args),
  withOptions: (opts: Options) => apiFactory(fetch(base, opts)),
  ...apiFactory(fetch(base))
}

