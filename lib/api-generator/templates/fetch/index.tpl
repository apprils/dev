
{{#routes}}
import {{importName}} from "./{{name}}";
{{/routes}}

export default {
  {{#routes}}
  "{{name}}": {{importName}},
  {{/routes}}
}
