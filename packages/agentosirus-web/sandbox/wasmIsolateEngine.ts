/**
 * wasmIsolateEngine.ts — SYNERGY #15: capability-gated WASM sandbox.
 *
 * Ported from morphic-kernel/wasm-runtime/core/wasmIsolateEngine.js
 * (`WasmIsolateEngine`), adapted from Node (process.stdout syscalls) to the
 * browser: `sys_write` now appends to an in-memory output buffer callers can
 * read, instead of writing to a Node stream.
 *
 * Neither ONITSIR nor agentosirus could previously safely RUN code an LLM
 * writes -- agentosirus's `LiveSandbox.tsx` name implied intent but no
 * verified isolation existed. This module provides real, working
 * capability-gated, gas-metered isolation using the native browser
 * WebAssembly API: memory ceilings are enforced by `WebAssembly.Memory`'s
 * `maximum`, and host syscalls are gated by an explicit capability list.
 *
 * `LiveSandbox.tsx` wires generated code through this isolate instead of
 * (presumably) only rendering it; successful sandboxed execution results
 * feed back to ONITSIR as `Evidence` (SYNERGY #4).
 */

export type Capability = "filesystem" | "network" | "privileged";

export interface IsolateHandle {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  capabilities: Capability[];
  output: string[];
  getGasRemaining: () => number;
  resetGas: (n: number) => void;
}

export class WasmIsolateEngine {
  private instances = new Map<string, IsolateHandle>();

  async createIsolate(
    moduleName: string,
    binaryBuffer: BufferSource,
    capabilities: Capability[] = [],
    gasLimit = 100000
  ): Promise<IsolateHandle> {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 10 });
    let currentGas = gasLimit;
    const output: string[] = [];

    const importObject: WebAssembly.Imports = {
      env: {
        memory,
        use_gas: (amount: number) => {
          currentGas -= amount;
          if (currentGas <= 0) throw new Error("RESOURCE_EXHAUSTION: gas budget depleted");
        },
        sys_write: (ptr: number, len: number) => {
          if (!capabilities.includes("filesystem") && !capabilities.includes("privileged")) {
            throw new Error("SECURITY_VIOLATION: unauthorized write in isolate");
          }
          const view = new Uint8Array(memory.buffer, ptr, len);
          const text = new TextDecoder("utf8").decode(view);
          output.push(text);
          return len;
        },
        sys_net_send: () => {
          if (!capabilities.includes("network")) throw new Error("SECURITY_VIOLATION: unauthorized network send");
          return 0;
        },
        sys_time: () => BigInt(Date.now())
      }
    };

    const wasmModule = await WebAssembly.compile(binaryBuffer);
    const instance = await WebAssembly.instantiate(wasmModule, importObject);
    const handle: IsolateHandle = {
      instance,
      memory,
      capabilities,
      output,
      getGasRemaining: () => currentGas,
      resetGas: (n: number) => {
        currentGas = n;
      }
    };
    this.instances.set(moduleName, handle);
    return handle;
  }

  execute(moduleName: string, exportFuncName: string, ...args: unknown[]): unknown {
    const isolate = this.instances.get(moduleName);
    if (!isolate) throw new Error(`ISOLATE_NOT_FOUND: ${moduleName}`);
    const fn = isolate.instance.exports[exportFuncName];
    if (typeof fn !== "function") throw new Error(`FUNCTION_NOT_EXPORTED: ${exportFuncName}`);
    return (fn as (...a: unknown[]) => unknown)(...args);
  }

  destroyIsolate(moduleName: string): void {
    this.instances.delete(moduleName);
  }
}
