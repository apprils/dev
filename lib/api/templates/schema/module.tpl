
import { use } from "@appril/core/router";
import { fromZodError } from "zod-validation-error";

{{tsToZod}}

function zodErrorHandler(
  error: any,
) {
  return fromZodError(error, {
    prefix: null,
    issueSeparator: ";\n",
  })
};

export default [
  {{#payloadParams}}
  use({ {{method}}: "{{params}}" }, (ctx, next) => {
    {{^errors.length}}
    try {
      {{id}}.parse(ctx.payload)
    } catch (error: any) {
      throw zodErrorHandler(error)
    }
    return next()
    {{/errors.length}}
    {{#errors.length}}
    throw `400: {{#errors}}{{.}}{{/errors}}`
    {{/errors.length}}
  })
  {{/payloadParams}}
]

