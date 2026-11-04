import {
    D3_PLUGIN_ENDPOINT,
    D3_PLUGIN_MODULE_REG_ENDPOINT,
    D3_LIVE_UPDATE_ENDPOINT,
    PluginException,
    PluginPayload,
    PluginRegisterResponse,
    PluginResponse,
    RegisterPayload,
    normaliseResponse,
} from "./models.js";

export type HttpMethod =
    "GET" | "OPTIONS" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export function getPluginEndpointUrl(hostname: string, port: number) {
    return `http://${hostname}:${port}/${D3_PLUGIN_ENDPOINT}`;
}

export function getPluginModuleRegisterUrl(hostname: string, port: number) {
    return `http://${hostname}:${port}/${D3_PLUGIN_MODULE_REG_ENDPOINT}`;
}

export function getLiveUpdateUrl(hostname: string, port: number) {
    return `ws://${hostname}:${port}/${D3_LIVE_UPDATE_ENDPOINT}`;
}

export async function d3ApiRequest<T = unknown>(
    method: HttpMethod,
    hostname: string,
    port: number,
    endpoint: string,
    init: RequestInit = {},
): Promise<T> {
    const response = await fetch(
        `http://${hostname}:${port}/${endpoint.replace(/^\//, "")}`,
        { ...init, method },
    );
    const body: unknown = await response.json();
    if (!response.ok)
        throw new Error(
            `Designer API HTTP ${response.status}: ${response.statusText}`,
        );
    return body as T;
}

export async function d3ApiExecute<T = unknown>(
    hostname: string,
    port: number,
    payload: PluginPayload<T>,
    timeoutMs?: number,
): Promise<PluginResponse<T>> {
    const controller = new AbortController();
    const timer =
        timeoutMs === undefined
            ? undefined
            : setTimeout(() => controller.abort(), timeoutMs);
    try {
        const raw = await d3ApiRequest<
            PluginResponse<T> | PluginResponse<null>
        >("POST", hostname, port, D3_PLUGIN_ENDPOINT, {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!raw.status || raw.status.code !== 0)
            throw new PluginException(raw.status, raw.d3Log, raw.pythonLog);
        return normaliseResponse(raw as PluginResponse<T>);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export async function d3ApiRegisterModule(
    hostname: string,
    port: number,
    payload: RegisterPayload,
    timeoutMs?: number,
): Promise<PluginRegisterResponse> {
    const controller = new AbortController();
    const timer =
        timeoutMs === undefined
            ? undefined
            : setTimeout(() => controller.abort(), timeoutMs);
    try {
        const raw = await d3ApiRequest<PluginRegisterResponse>(
            "POST",
            hostname,
            port,
            D3_PLUGIN_MODULE_REG_ENDPOINT,
            {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
            },
        );
        if (!raw.status || raw.status.code !== 0)
            throw new PluginException(raw.status);
        return raw;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
