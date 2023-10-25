{{BANNER}}

import type { App } from "vue";

import * as {{pluginName}} from "{{path}}";

export default {

  install(app: App) {
  {{#globalProperties}}
    app.config.globalProperties.{{globalName}} = {{pluginName}}.{{name}};
  {{/globalProperties}}
  },

}

