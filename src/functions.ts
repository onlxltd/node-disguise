import { PluginPayload, RegisterPayload } from "./models.js";

export interface PythonFunctionDefinition {
    name: string;
    parameters?: string[];
    body: string;
}

const repr = (value: unknown) =>
    JSON.stringify(value)
        .replace(/\btrue\b/g, "True")
        .replace(/\bfalse\b/g, "False")
        .replace(/\bnull\b/g, "None");

const callArgs = (args: unknown[], kwargs: Record<string, unknown>) =>
    [
        ...args.map(repr),
        ...Object.entries(kwargs).map(([k, v]) => `${k}=${repr(v)}`),
    ].join(", ");

const validate = (
    def: PythonFunctionDefinition,
    args: unknown[],
    kwargs: Record<string, unknown>,
) => {
    const params = def.parameters ?? [];
    if (args.length > params.length)
        throw new TypeError(
            `${def.name} received too many positional arguments`,
        );
    for (const p of params.slice(args.length))
        if (!(p in kwargs))
            throw new TypeError(
                `${def.name} is missing a required argument: ${p}`,
            );
};

export class D3PythonScript<T = unknown> {
    public constructor(public readonly definition: PythonFunctionDefinition) {}

    public payload(...args: unknown[]): PluginPayload<T> {
        return this.payloadWith(args, {});
    }

    public payloadWith(
        args: unknown[],
        kwargs: Record<string, unknown> = {},
    ): PluginPayload<T> {
        validate(this.definition, args, kwargs);
        return {
            script: `${this.definition.parameters?.map((p, i) => `${p}=${repr(args[i])}`).join("\n") ?? ""}${this.definition.parameters?.length ? "\n" : ""}${this.definition.body}`,
        };
    }
}

export class D3Function<T = unknown> extends D3PythonScript<T> {
    public constructor(
        public readonly moduleName: string,
        definition: PythonFunctionDefinition,
    ) {
        super(definition);
    }

    public override payload(...args: unknown[]): PluginPayload<T> {
        return this.payloadWith(args, {});
    }

    public override payloadWith(
        args: unknown[],
        kwargs: Record<string, unknown> = {},
    ): PluginPayload<T> {
        validate(this.definition, args, kwargs);
        return {
            moduleName: this.moduleName,
            script: `return ${this.definition.name}(${callArgs(args, kwargs)})`,
        };
    }

    public registerPayload(): RegisterPayload {
        return {
            moduleName: this.moduleName,
            contents: `\n${this.definitionToPython()}\n`,
        };
    }

    private definitionToPython() {
        const params = this.definition.parameters?.join(", ") ?? "";
        const body = this.definition.body
            .split("\n")
            .map((line) => `    ${line}`)
            .join("\n");
        return `def ${this.definition.name}(${params}):\n${body}`;
    }
}

export const d3pythonscript = <T = unknown>(
    definition: PythonFunctionDefinition,
) => new D3PythonScript<T>(definition);

export const d3function = <T = unknown>(
    moduleName: string,
    definition: PythonFunctionDefinition,
) => new D3Function<T>(moduleName, definition);
