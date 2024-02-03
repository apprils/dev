{{BANNER}}

{{! ambient modules declarations; do not use global import/export here! }}

{{#modules}}
declare module "{{id}}" {
{{code}}
}

{{/modules}}

declare module "{{defaultModuleId}}" {

{{#modules}}
import {{importName}} from "{{id}}";
{{/modules}}

export default {
  {{#modules}}
  "{{name}}": {{importName}},
  {{/modules}}
}

}

declare module "{{fetchBaseModule}}" {
{{fetchBaseModuleCode}}
}

