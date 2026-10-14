// Lets node's own TypeScript support run the site's lib/*.ts modules as they are: they import each
// other without a file extension, the way the bundler resolves them, and node asks for one.
//
//   node --import ./tests/unit/ts-resolve.mjs --test tests/unit/*.test.mjs
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + ".ts", context);
      throw e;
    }
  },
});
