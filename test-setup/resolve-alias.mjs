// O runner de testes do Node resolve módulos como o Node puro: não conhece o
// alias "@/..." do tsconfig nem imports relativos sem extensão — as duas
// convenções que o bundler do Next resolve sozinho. Este hook ensina as duas,
// para que os testes exercitem o código de produção sem alterá-lo.
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src");

function firstExisting(base) {
  const candidates = [`${base}.ts`, `${base}.tsx`, base, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.find((p) => existsSync(p) && statSync(p).isFile());
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) {
      base = path.join(SRC, specifier.slice(2));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      const found = firstExisting(base);
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
