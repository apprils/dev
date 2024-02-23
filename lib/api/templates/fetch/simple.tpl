
import {
  fetchFactory,
  baseurl, apiurl,
  join, stringify,
} from "@fetch/@base";

export const name = "{{name}}";
export const base = join(baseurl, apiurl, "{{path}}");

export const createApi = (
  opts?: import("@appril/more/fetch").Options,
) => fetchFactory(base, { stringify, ...opts });

export const fetch = createApi()

export default {
  ...fetch,
  get name() { return name },
  get base() { return base },
  createApi,
  fetch,
};
