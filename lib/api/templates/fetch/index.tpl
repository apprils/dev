{{BANNER}}

/// <reference path="./_fetch.d.ts" />

{{#modules}}
import {{importName}} from "{{id}}";
{{/modules}}

export default {
  {{#modules}}
  "{{name}}": {{importName}},
  {{/modules}}
}

