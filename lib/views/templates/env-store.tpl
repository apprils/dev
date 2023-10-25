{{BANNER}}

import { defineStore } from "pinia";

{{#importFetch}}
import fetch from "@/fetch";{{/importFetch}}

{{#typeImports}}
import type { {{import}} } from "{{from}}";
{{/typeImports}}

export type State = {
{{#views}}
  "{{name}}": {{envType}} | null;
{{/views}}
}

const fetchMap = {
{{#views}}
  {{#envApi}}
    "{{name}}": () => fetch("{{envApi}}").get<{{envType}}>(),
  {{/envApi}}
  {{^envApi}}
    "{{name}}": () => Promise.resolve(null),
  {{/envApi}}
{{/views}}
}

export default defineStore({

  id: "envStore",

  state(): State {
    return {
    {{#views}}
      "{{name}}": null,
    {{/views}}
    }
  },

  actions: {
    async $fetch(key: keyof State) {
      this[key] = await fetchMap[key]()
    },
  },

})

