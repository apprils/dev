{{BANNER}}

import { defineStore } from "pinia";

import fetch from "@fetch/../index";

export type State = {
{{#viewsWithEnvApi}}
  "{{name}}": Awaited<ReturnType<typeof fetch["{{name}}"]["get"]>> | undefined;
{{/viewsWithEnvApi}}
}

export const key = Symbol() as import("vue").InjectionKey<State>;

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

