{{BANNER}}

import { defineStore } from "pinia";

import fetch from "@fetch/../index";

export type State = {
{{#pagesWithEnvApi}}
  "{{name}}": Awaited<ReturnType<typeof fetch["{{name}}"]["get"]>> | undefined;
{{/pagesWithEnvApi}}
}

export const key = Symbol() as import("vue").InjectionKey<State>;

const fetchMap = {
{{#pagesWithEnvApi}}
  "{{name}}": fetch["{{envApi}}"].get,
{{/pagesWithEnvApi}}
}

export default defineStore({

  id: "envStore",

  state(): State {
    return {
    {{#pagesWithEnvApi}}
      "{{name}}": undefined,
    {{/pagesWithEnvApi}}
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

