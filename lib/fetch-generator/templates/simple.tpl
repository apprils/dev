import {
  baseurl, apiurl,
  fetchFactory, fetchOptions,
  join, withLoader,
} from "@fetch/../base";

export const name = "{{name}}";
export const base = join(baseurl, apiurl, "{{path}}");

export const createApi = (
  options?: import("@appril/more/fetch").Options,
) => fetchFactory(base, { ...fetchOptions, ...options });

export const fetch = createApi()

export { withLoader };

export default {
  ...fetch,
  get name() { return name },
  get base() { return base },
  createApi,
  fetch,
  withLoader,
};
