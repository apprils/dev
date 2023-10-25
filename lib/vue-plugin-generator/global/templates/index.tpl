{{BANNER}}

import type { App } from "vue";

{{#generatedPlugins}}
import { default as {{pluginName}} } from "./{{pluginName}}";
{{/generatedPlugins}}

export default {

  install(app: App) {
  {{#generatedPlugins}}
    app.use({{pluginName}});
  {{/generatedPlugins}}
  }

}

