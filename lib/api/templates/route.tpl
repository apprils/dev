
import { get } from "{{importBase}}/api";

export default [

  get(async (env) => {
    env.body = "Automatically generated route: [ {{name}} ]"
  }),

]

