import {
    d3ApiExecute,
    d3ApiRegisterModule,
    d3ApiRequest,
    HttpMethod,
} from "./api.js";
import { D3Function } from "./functions.js";
import {
    D3_PLUGIN_DEFAULT_PORT,
    PluginPayload,
    PluginResponse,
    RegisterPayload,
} from "./models.js";

export class D3Session {
    public readonly registeredModules = new Set<string>();

    public constructor(
        public readonly hostname: string,
        public readonly port = D3_PLUGIN_DEFAULT_PORT,
        private readonly modules: Map<string, D3Function> = new Map(),
    ) {}

    public async execute<T>(payload: PluginPayload<T>, timeoutMs?: number) {
        if (
            payload.moduleName &&
            !this.registeredModules.has(payload.moduleName)
        )
            await this.registerModule(payload.moduleName, timeoutMs);
        return d3ApiExecute<T>(this.hostname, this.port, payload, timeoutMs);
    }

    public async rpc<T>(
        payload: PluginPayload<T>,
        timeoutMs?: number,
    ): Promise<T> {
        return (await this.execute(payload, timeoutMs)).returnValue;
    }

    public async request<T = unknown>(
        method: HttpMethod,
        endpoint: string,
        init?: RequestInit,
    ) {
        return d3ApiRequest<T>(
            method,
            this.hostname,
            this.port,
            endpoint,
            init,
        );
    }

    public addModule(fn: D3Function) {
        this.modules.set(fn.moduleName, fn);
        return this;
    }

    public async registerModule(name: string, timeoutMs?: number) {
        const fn = this.modules.get(name);
        if (!fn) return false;
        await d3ApiRegisterModule(
            this.hostname,
            this.port,
            fn.registerPayload(),
            timeoutMs,
        );
        this.registeredModules.add(name);
        return true;
    }

    public async registerAllModules(timeoutMs?: number) {
        const result: Record<string, boolean> = {};
        for (const name of this.modules.keys())
            result[name] = await this.registerModule(name, timeoutMs);
        return result;
    }
}
