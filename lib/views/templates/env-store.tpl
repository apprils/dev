{{BANNER}}

import { defineStore } from "pinia";

{{#viewsWithEnvApi.length}}
import fetch from "{{sourceFolder}}/api/_fetch";
{{/viewsWithEnvApi.length}}

export type State = {
{{#viewsWithEnvApi}}
  "{{name}}": Awaited<ReturnType<typeof fetch["{{name}}"]["get"]>> | undefined;
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

