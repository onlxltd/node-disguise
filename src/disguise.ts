import { D3Session } from "./session.js";
import { LiveUpdate } from "./live-update.js";
import {
    D3_MEMBER_METADATA,
    type D3Globals,
    type D3TypeRegistry,
} from "./d3-types.generated.js";

export interface PythonExpression {
    readonly expression: string;
}

export type DesignerType<T> = PythonExpression & {
    readonly __designerType?: T;
};

export type DesignerPathNode = {
    readonly path: string;
    search(): Promise<ReadonlyArray<string>>;
    execute(): Promise<ReadonlyArray<string>>;
    execute<T>(
        expectedType: DesignerType<T>,
    ): Promise<ReadonlyArray<DesignerValue<T>>>;
} & {
    readonly [segment: string]: DesignerPathNode;
};

type DesignerMembers<T> = {
    [K in keyof T as K extends "map" | number ? never : K]: T[K] extends (
        ...args: infer Arguments
    ) => infer Return
        ? (
              ...args: DesignerArguments<Arguments>
          ) => Promise<DesignerResult<Return>>
        : DesignerProperty<T[K]>;
};

type DesignerCollection<T> = {
    readonly [index: number]: DesignerProperty<T>;
    map<U>(
        callback: (item: DesignerValue<T>) => U,
    ): DesignerProperty<ReadonlyArray<UnwrapDesigner<U>>>;
};

export type DesignerValue<T> = PythonExpression & {
    readonly __designerValue?: T;
} & (T extends ReadonlyArray<infer Item>
        ? DesignerCollection<Item> & DesignerMembers<T>
        : DesignerMembers<T>);

type DesignerProperty<T> = DesignerValue<T> & {
    get(): Promise<DesignerResult<T>>;
    execute(): Promise<DesignerResult<T>>;
};

type UnwrapDesigner<T> =
    T extends DesignerProperty<infer Value>
        ? Value
        : T extends ReadonlyArray<infer Item>
          ? ReadonlyArray<UnwrapDesigner<Item>>
          : T extends object
            ? { [K in keyof T]: UnwrapDesigner<T[K]> }
            : T;

type DesignerArguments<T extends readonly unknown[]> = {
    [K in keyof T]: T[K] extends object
        ? DesignerValue<T[K]> | DesignerType<T[K]> | T[K]
        : T[K];
};

type DesignerResult<T> =
    T extends ReadonlyArray<infer Item>
        ? ReadonlyArray<DesignerResult<Item>>
        : T extends object
          ? DesignerValue<T>
          : T;

const pythonLiteral = (value: unknown): string => {
    if (isPythonExpression(value)) return value.expression;
    if (value === null) return "None";
    if (value === undefined) return "None";
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(", ")}]`;
    if (typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .map(
                ([key, item]) =>
                    `${pythonLiteral(key)}: ${pythonLiteral(item)}`,
            )
            .join(", ")}}`;
    }
    return String(value);
};

const isPythonExpression = (value: unknown): value is PythonExpression =>
    typeof value === "object" && value !== null && "expression" in value;

type TypeName = keyof typeof D3_MEMBER_METADATA | string;

const typeMetadata = (typeName: TypeName) =>
    D3_MEMBER_METADATA[typeName as keyof typeof D3_MEMBER_METADATA] as
        | {
              properties: Record<string, string>;
              methods: readonly string[];
              methodTypes: Record<string, string>;
          }
        | undefined;

const arrayItemType = (typeName: TypeName) =>
    typeName.match(/^(?:ReadonlyArray|Array)<(.+)>$/)?.[1];

const isArrayIndex = (property: PropertyKey) =>
    typeof property === "string" && /^(?:0|[1-9]\d*)$/.test(property);

const createProxy = <T>(
    connection: DisguiseConnection,
    expression: string,
    typeName: TypeName = "D3Globals",
): DesignerValue<T> =>
    new Proxy({ expression } as DesignerValue<T>, {
        get(target, property) {
            if (property === "expression") return target.expression;
            if (property === "then") return undefined;
            const nextExpression = target.expression
                ? `${target.expression}.${String(property)}`
                : String(property);
            const metadata = typeMetadata(typeName);
            const propertyName = String(property);
            if (metadata?.properties[propertyName])
                return createPropertyProxy(
                    connection,
                    nextExpression,
                    metadata.properties[propertyName],
                );
            return createCallableProxy(
                connection,
                nextExpression,
                metadata?.methodTypes[propertyName],
            );
        },
    });

const createPropertyProxy = <T>(
    connection: DisguiseConnection,
    expression: string,
    typeName: TypeName,
): DesignerProperty<T> =>
    new Proxy({ expression } as DesignerProperty<T>, {
        get(target, property) {
            if (property === "expression") return target.expression;
            if (property === "then") return undefined;
            if (isArrayIndex(property)) {
                const itemType = arrayItemType(typeName);
                return createProxy(
                    connection,
                    `${expression}[${String(property)}]`,
                    itemType ?? "unknown",
                );
            }
            if (property === "map") {
                const itemType = arrayItemType(typeName);
                return (callback: (item: DesignerValue<unknown>) => unknown) =>
                    createMappedProperty(
                        connection,
                        expression,
                        itemType ?? "unknown",
                        callback,
                    );
            }
            if (property === "get" || property === "execute")
                return () => connection.executeExpression<T>(expression);
            const metadata = typeMetadata(typeName);
            const propertyName = String(property);
            const nextExpression = `${expression}.${propertyName}`;
            if (metadata?.properties[propertyName])
                return createPropertyProxy(
                    connection,
                    nextExpression,
                    metadata.properties[propertyName],
                );
            return createCallableProxy(
                connection,
                nextExpression,
                metadata?.methodTypes[propertyName],
            );
        },
    });

const createMappedProperty = (
    connection: DisguiseConnection,
    expression: string,
    itemType: TypeName,
    callback: (item: DesignerValue<unknown>) => unknown,
) => {
    const item = createProxy<unknown>(connection, "item", itemType);
    const selected = callback(item);
    return createPropertyProxy<ReadonlyArray<unknown>>(
        connection,
        `[${pythonLiteral(selected)} for item in ${expression}]`,
        "ReadonlyArray<unknown>",
    );
};

const createCallableProxy = <T>(
    connection: DisguiseConnection,
    expression: string,
    typeName?: TypeName,
): DesignerValue<T> =>
    new Proxy((() => undefined) as unknown as DesignerValue<T>, {
        get(_target, property) {
            if (property === "expression") return expression;
            if (property === "then") return undefined;
            return createCallableProxy(
                connection,
                `${expression}.${String(property)}`,
            );
        },
        apply(_target, _thisArg, args) {
            return createResultProxy<T>(
                connection,
                `${expression}(${args.map(pythonLiteral).join(", ")})`,
                typeName,
            );
        },
    });

const createResultProxy = <T>(
    connection: DisguiseConnection,
    expression: string,
    typeName?: TypeName,
) =>
    new Proxy(
        { expression },
        {
            get(_target, property) {
                if (property === "expression") return expression;
                if (property === "then") {
                    return (
                        resolve: (value: unknown) => void,
                        reject: (reason: unknown) => void,
                    ) =>
                        connection
                            .executeExpression<T>(expression)
                            .then(resolve, reject);
                }
                if (isArrayIndex(property)) {
                    const itemType = typeName
                        ? arrayItemType(typeName)
                        : undefined;
                    return createProxy(
                        connection,
                        `${expression}[${String(property)}]`,
                        itemType ?? "unknown",
                    );
                }
                const metadata = typeName ? typeMetadata(typeName) : undefined;
                const propertyName = String(property);
                const nextExpression = `${expression}.${propertyName}`;
                if (metadata?.properties[propertyName])
                    return createPropertyProxy(
                        connection,
                        nextExpression,
                        metadata.properties[propertyName],
                    );
                return createCallableProxy(
                    connection,
                    nextExpression,
                    metadata?.methodTypes[propertyName],
                );
            },
        },
    );

const createTypeRegistry = (connection: DisguiseConnection): D3TypeRegistry =>
    new Proxy(
        {},
        {
            get(_target, property) {
                return {
                    expression: String(property),
                } as D3TypeRegistry[keyof D3TypeRegistry];
            },
        },
    ) as D3TypeRegistry;

const createPathNode = (
    connection: DisguiseConnection,
    path: string,
): DesignerPathNode =>
    new Proxy({ path } as DesignerPathNode, {
        get(target, property) {
            if (property === "path") return target.path;
            if (property === "then") return undefined;
            if (property === "search") {
                return () =>
                    connection.executeExpression<ReadonlyArray<string>>(
                        `resourceManager.search(${pythonLiteral(path)})`,
                    );
            }
            if (property === "execute") {
                return (expectedType?: DesignerType<unknown>) => {
                    if (!expectedType)
                        return connection.executeExpression<
                            ReadonlyArray<string>
                        >(`resourceManager.search(${pythonLiteral(path)})`);
                    return connection.executeExpression<
                        ReadonlyArray<DesignerValue<unknown>>
                    >(
                        `[resourceManager.load(Path(p), ${expectedType.expression}) for p in resourceManager.search(${pythonLiteral(path)})]`,
                    );
                };
            }
            return createPathNode(connection, `${path}/${String(property)}`);
        },
    });

export interface DisguiseConnectionOptions {
    hostname?: string;
    port?: number;
    session?: D3Session;
}

export class DisguiseConnection {
    public readonly session: D3Session;
    public readonly liveUpdate: LiveUpdate;
    public readonly d3: DesignerValue<D3Globals>;
    public readonly types: D3TypeRegistry;
    public readonly objects: DesignerPathNode;

    public constructor(options: DisguiseConnectionOptions = {}) {
        this.session =
            options.session ??
            new D3Session(options.hostname ?? "localhost", options.port ?? 80);
        this.liveUpdate = new LiveUpdate(this.session);
        this.d3 = createProxy<D3Globals>(this, "", "D3Globals");
        this.types = createTypeRegistry(this);
        this.objects = createPathNode(this, "objects");
    }

    public execute<T>(
        payload: { script: string; moduleName?: string },
        timeoutMs?: number,
    ) {
        return this.session.rpc<T>(payload, timeoutMs);
    }

    public executeExpression<T>(expression: string, timeoutMs?: number) {
        return this.execute<T>({ script: `return ${expression}` }, timeoutMs);
    }

    public expression<T = unknown>(expression: string): DesignerValue<T> {
        return createProxy<T>(this, expression);
    }
}
