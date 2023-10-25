
import { get } from "@/api";

export default [

  get(async (env) => {
    env.body = "Automatically generated route: [ {{name}} ]"
  }),

]

