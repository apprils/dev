
import type { Middleware } from "koa";

{{#importZodErrorHandlerFrom}}
import { zodErrorHandler } from "{{importZodErrorHandlerFrom}}";
{{/importZodErrorHandlerFrom}}

{{^importZodErrorHandlerFrom}}
import { fromZodError } from "zod-validation-error";
function zodErrorHandler(error: any) {
  return fromZodError(error, {
    prefix: null,
    issueSeparator: ";\n",
  })
};
{{/importZodErrorHandlerFrom}}

{{zodSchemas}}

export default {
  {{^errors.length}}
  {{#payloadTypes}}
  {{index}}: [
    (ctx, next) => {
      try {
        {{id}}.parse(ctx["@payload"])
      } catch (error: any) {
        throw zodErrorHandler(error)
      }
      return next()
    }
  ] satisfies Middleware[],
  {{/payloadTypes}}
  {{/errors.length}}
}

{{#errors.length}}
console.error("{{path}}: failed building zod schema(s)")
{{#errors}}
console.error(`{{.}}`)
{{/errors}}
{{/errors.length}}

