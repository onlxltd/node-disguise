import { D3Session } from "./session.js";
import { PluginPayload, PluginResponse } from "./models.js";

/** Base class for clients whose methods execute on Designer.
 *
 * TypeScript cannot execute a TypeScript method body inside Designer's Python 2.7
 * runtime. Concrete clients therefore use `remote()` from their methods and keep
 * the Python implementation in a registered `D3Function`.
 */
export abstract class D3PluginClient {
    private session?: D3Session;
    public connect(session: D3Session): this {
        this.session = session;
        return this;
    }

    public disconnect() {
        this.session = undefined;
    }

    public inSession() {
        return this.session !== undefined;
    }

    protected async execute<T>(
        payload: PluginPayload<T>,
        timeoutMs?: number,
    ): Promise<PluginResponse<T>> {
        if (!this.session)
            throw new Error(
                `${this.constructor.name} is not in an active session`,
            );
        return this.session.execute(payload, timeoutMs);
    }

    protected async remote<T>(
        methodName: string,
        args: unknown[] = [],
        kwargs: Record<string, unknown> = {},
        timeoutMs?: number,
    ): Promise<T> {
        return (
            await this.execute<T>(
                {
                    moduleName: this.constructor.name,
                    script: `return plugin.${methodName}(${[...args.map((v) => JSON.stringify(v)), ...Object.entries(kwargs).map(([k, v]) => `${k}=${JSON.stringify(v)}`)].join(", ")})`,
                },
                timeoutMs,
            )
        ).returnValue;
    }
}
