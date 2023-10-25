{{BANNER}}

{{#generatedPlugins}}
import { default as {{pluginName}} } from "./{{pluginName}}";
{{/generatedPlugins}}

declare module "vue" {

  interface ComponentCustomProperties {
  {{#generatedPlugins}}
  {{#globalProperties}}
    {{globalName}}: typeof {{pluginName}}.{{name}};
  {{/globalProperties}}
  {{/generatedPlugins}}
  }

}

