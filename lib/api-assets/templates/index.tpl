
{{#routes}}
{{#assetsPath}}
import {{importName}} from "{{assetsPath}}";
{{/assetsPath}}
{{^assetsPath}}
const {{importName}} = {};
{{/assetsPath}}
{{/routes}}

export default {
  {{#routes}}
  "{{name}}": {{importName}},
  {{/routes}}
}

