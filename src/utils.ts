/**
 * Function used to convert RGBA packed data into floating-point value.
 * 
 * Since this operates across Web Worker boundaries, it must only utilise the given parameter list.
 * External references not supported.
 * 
 * Supported function syntax:
 *   1) (r, g, b, a) => 0.0
 *   2) (r, g, b) => {
 *          return 0.0;
 *      }
 *   3) function f(r, g, b, a) {
 *          return 0.0;
 *      }
 */
export type DecodeRgbFunction = (r: number, g: number, b: number, a: number) => number;

/**
 * Regex supports the following function syntax:
 * 1) a => a * 2
 * 2) a => {
 *        const x = a * 2;
 *        return x;
 *    }
 * 3) (a, b) => a + b
 * 4) function f(a) {
 *        return a * 2;
 *    } 
 */
 const functionParser = /^(?:(?:function\s+\w+\s*)?\(?(?<params>(?:\w+\s*,?\s*)*)\)?\s*(?:=>)?\s*\{?(?<body>(?:.|[\s\n])+?)\}?)$/gi;

 // mapbox Terrain-RGB default decode function
 const defaultDecodeRgb = (r, g, b, a) => (r * 256 * 256) * 0.1 + (g * 256.0) * 0.1 + b * 0.1 - 10000;
 
 /**
  * @param fn DecodeRgbFunction callable or string representation of a DecodeRgbFunction.
  * @returns A concrete DecodeRgbFunction callable.
  */
export function getDecodeRgbFunction(fn: DecodeRgbFunction | string | null, cache?: { [key: string]: DecodeRgbFunction }): DecodeRgbFunction {
  if (!fn) return defaultDecodeRgb;

  if (typeof fn === 'string') {
    if (cache?.[fn]) return cache[fn];
    try {
      // parse function string
      const { groups: { params, body } } = functionParser.exec(fn.trim());
      const retfn = new Function(
        ...params.split(',').map(x => x.trim()),
        body.trim(),
      ) as DecodeRgbFunction;
      if (cache) {
        cache[fn] = retfn;
      }

      return retfn;
    } catch {
      // malformed transform function, or potential CSP error
    }
  } else if (typeof fn === 'function') {
    return fn;
  }

  return defaultDecodeRgb;
}
 