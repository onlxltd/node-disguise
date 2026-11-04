export const D3_PLUGIN_ENDPOINT = "api/session/python/execute";
export const D3_PLUGIN_MODULE_REG_ENDPOINT =
    "api/session/python/registermodule";
export const D3_LIVE_UPDATE_ENDPOINT = "api/session/liveupdate";
export const D3_PLUGIN_DEFAULT_PORT = 80;

export interface PluginStatusDetail {
    type_url: string;
    value: string;
}

export interface PluginStatus {
    code: number;
    message: string;
    details: PluginStatusDetail[];
}

export interface PluginPayload<T = unknown> {
    moduleName?: string;
    script: string;
}

export interface RegisterPayload {
    moduleName: string;
    contents: string;
}

export interface PluginResponse<T = unknown> {
    status: PluginStatus;
    d3Log?: string | null;
    pythonLog?: string | null;
    returnValue: T;
}

export interface PluginRegisterResponse {
    status: PluginStatus;
}

export function parseReturnValue<T>(value: unknown): T {
    if (typeof value !== "string") return value as T;
    if (value === "null") return null as T;
    try {
        return JSON.parse(value) as T;
    } catch {
        return value as T;
    }
}

export class PluginException extends Error {
    public constructor(
        public readonly status: PluginStatus,
        public readonly d3Log?: string | null,
        public readonly pythonLog?: string | null,
    ) {
        super(`D3PluginError (${status.code}): ${status.message}`);
        this.name = "PluginException";
    }
}

export function normaliseResponse<T>(
    raw: PluginResponse<T>,
): PluginResponse<T> {
    return { ...raw, returnValue: parseReturnValue<T>(raw.returnValue) };
}
