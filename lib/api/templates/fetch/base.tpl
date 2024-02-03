
export function useMethodArgsMapper(...args: any[]) {

  const [ strings, objects ] = args.reduce((acc,arg) => {
    acc[
       Object.prototype.toString.call(arg) === "[object Object]"
        ? 1
        : 0
    ].push(arg)
    return acc
  }, [ [], [] ])

  const [ data, useFetchOptions ] = objects

  return [ [ ...strings, data ], useFetchOptions ]
}

