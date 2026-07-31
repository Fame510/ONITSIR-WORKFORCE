/**
 * watCompiler.ts — SYNERGY #15: real WAT -> WASM compiler via the optional
 * `wabt` dependency.
 *
 * Ported from morphic-kernel/wasm-runtime/core/watCompiler.js. If `wabt` is
 * not installed, compilation throws a clear error instead of silently
 * returning a fake module -- matching morphic-kernel's explicit fix of the
 * "original hardcoded-stub compiler" problem. Install with: npm install wabt
 */
let wabtPromise: Promise<WabtModule | null> | null = null;

// Minimal shape of the `wabt` package's runtime API actually used here.
interface WabtParsedModule {
  resolveNames(): void;
  validate(): void;
  toBinary(opts: { log: boolean; write_debug_names: boolean }): { buffer: ArrayBuffer };
  destroy(): void;
}
interface WabtModule {
  parseWat(name: string, source: string): WabtParsedModule;
}

async function getWabt(): Promise<WabtModule | null> {
  if (!wabtPromise) {
    wabtPromise = import(/* @vite-ignore */ "wabt")
      .then((m: { default?: () => Promise<WabtModule> } & (() => Promise<WabtModule>)) => {
        const factory = m.default || m;
        return factory();
      })
      .catch(() => null);
  }
  return wabtPromise;
}

export async function wat2wasm(watSource: string, options: { moduleName?: string } = {}): Promise<Uint8Array> {
  const moduleName = options.moduleName || "module";
  const wabt = await getWabt();
  if (!wabt) {
    throw new Error(
      "WAT_COMPILER_UNAVAILABLE: the optional `wabt` package is not installed. " +
      "Run `npm install wabt` to enable real WAT->WASM compilation."
    );
  }
  const parsed = wabt.parseWat(moduleName, watSource);
  try {
    parsed.resolveNames();
    parsed.validate();
    const { buffer } = parsed.toBinary({ log: false, write_debug_names: false });
    return new Uint8Array(buffer);
  } finally {
    parsed.destroy();
  }
}

export async function isCompilerAvailable(): Promise<boolean> {
  return (await getWabt()) !== null;
}
