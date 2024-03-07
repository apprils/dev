
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
  middleworkerParams: {
    {{#middleworkerParams}}
    {{index}}: "{{text}}",
    {{/middleworkerParams}}
  },

  payloadValidation: {
    {{#payloadTypes}}
    {{index}}: [
      (ctx, next) => {
        try {
          {{id}}.parse(ctx.payload)
        } catch (error: any) {
          throw zodErrorHandler(error)
        }
        return next()
      }
    ] satisfies Middleware[],
    {{/payloadTypes}}
  },

}

{{#errors.length}}
console.error("\n[ \x1b[31m{{file}}\x1b[0m ]: failed building zod schema(s)")
{{#errors}}
console.error(`{{.}}`)
{{/errors}}
{{/errors.length}}

