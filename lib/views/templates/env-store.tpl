{{BANNER}}

import { defineStore } from "pinia";

{{#viewsWithEnvApi.length}}
import fetch from "{{importBase}}/{{fetchDir}}";
{{/viewsWithEnvApi.length}}

{{#viewsWithEnvApi}}
import { apiFactory as {{importName}}EnvApi } from "{{importBase}}/{{fetchDir}}/api/{{envApi}}";
{{/viewsWithEnvApi}}

export type State = {
{{#viewsWithEnvApi}}
  "{{name}}": Awaited<ReturnType<ReturnType<typeof {{importName}}EnvApi>["get"]>> | undefined;
{{/viewsWithEnvApi}}
}

const fetchMap = {
{{#viewsWithEnvApi}}
  "{{name}}": fetch["{{envApi}}"].get,
{{/viewsWithEnvApi}}
}

export default defineStore({

  id: "envStore",

  state(): State {
    return {
    {{#viewsWithEnvApi}}
      "{{name}}": undefined,
    {{/viewsWithEnvApi}}
    }
  },

  actions: {
    async $fetch(key: keyof State) {
      if (key in fetchMap) {
        this[key] = await fetchMap[key]()
      }
    },
  },

})

