import { getLiveUpdateUrl } from "./api.js";
import type { DesignerType, PythonExpression } from "./disguise.js";
import {
    D3_MEMBER_METADATA,
    type D3TypeRegistry,
} from "./d3-types.generated.js";
import { D3Session } from "./session.js";

export interface LiveUpdateConfiguration {
    updateFrequencyMs?: number;
}

export type LiveUpdatePropertyPaths =
    | string
    | LiveUpdateExpression
    | ReadonlyArray<string | LiveUpdateExpression>;
export type LiveUpdateIdentifier = string | number;

/** A typed expression understood by the Designer live-update protocol. */
export type LiveUpdateExpression<T = unknown> = PythonExpression & {
    readonly __liveUpdateType?: T;
};

type LiveUpdateArgument<T> = T extends object ? LiveUpdateExpression<T> | T : T;

type LiveUpdateArguments<T extends readonly unknown[]> = {
    [K in keyof T]: LiveUpdateArgument<T[K]>;
};

type LiveUpdateMembers<T> = {
    [K in keyof T as K extends "map" | number ? never : K]: T[K] extends (
        ...args: infer Arguments
    ) => infer Return
        ? (
              ...args: LiveUpdateArguments<Arguments>
          ) => LiveUpdateExpression<Return>
        : LiveUpdateExpression<T[K]>;
};

type LiveUpdateTargetMembers<T> = {
    [K in keyof T as K extends "map" | number ? never : K]: T[K] extends (
        ...args: infer Arguments
    ) => infer Return
        ? (...args: LiveUpdateArguments<Arguments>) => LiveUpdateTarget<Return>
        : LiveUpdateTarget<T[K]>;
};

/** A typed live-update object selector. */
export type LiveUpdateTarget<T> = LiveUpdateExpression<T> &
    LiveUpdateTargetMembers<T> & {
        /** Switch from the selected object to its live-update property namespace. */
        readonly object: LiveUpdateMembers<T>;
    };

type D3TypeValue<K extends keyof D3TypeRegistry> =
    D3TypeRegistry[K] extends DesignerType<infer T> ? T : never;

/** Typed subsystem selectors generated from the d3.pyi class declarations. */
export type LiveUpdateSubsystem = {
    [K in keyof D3TypeRegistry]: LiveUpdateTarget<D3TypeValue<K>>;
};

export interface LiveUpdateSubscription {
    id: number;
    objectPath: string;
    propertyPath: string;
}

export interface LiveUpdateValueChange {
    id: number;
    value: unknown;
    changeTimestamp?: number;
    messageTimestamp?: number;
}

export type LiveUpdateListener = (
    change: LiveUpdateValueChange,
    subscription: LiveUpdateSubscription | undefined,
) => void;

export interface LiveUpdateSocket {
    readonly readyState: number;
    onopen: (() => void) | null;
    onmessage: ((event: { data: string }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    send(data: string): void;
    close(): void;
}

export type LiveUpdateSocketFactory = (url: string) => LiveUpdateSocket;

const OPEN = 1;

const pythonLiteral = (value: unknown): string => {
    if (isExpression(value)) return value.expression;
    if (value === null || value === undefined) return "None";
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

const typeMetadata = (typeName: string) =>
    D3_MEMBER_METADATA[typeName as keyof typeof D3_MEMBER_METADATA] as
        | {
              properties: Record<string, string>;
              methods: readonly string[];
              methodTypes: Record<string, string>;
          }
        | undefined;

const isExpression = (value: unknown): value is PythonExpression =>
    typeof value === "object" &&
    value !== null &&
    "expression" in value &&
    typeof value.expression === "string";

const createLiveExpression = <T>(
    expression: string,
    typeName: string,
): LiveUpdateExpression<T> =>
    new Proxy({ expression } as LiveUpdateExpression<T>, {
        get(target, property) {
            if (property === "expression") return target.expression;
            if (property === "then") return undefined;
            return createLiveMembers<T>(
                `${target.expression}.${String(property)}`,
                typeName,
            );
        },
    });

const createLiveMembers = <T>(
    expression: string,
    typeName: string,
): LiveUpdateMembers<T> =>
    new Proxy({} as LiveUpdateMembers<T>, {
        get(_target, property) {
            if (property === "then") return undefined;
            const name = String(property);
            const nextExpression = `${expression}.${name}`;
            const metadata = typeMetadata(typeName);
            if (metadata?.methods.includes(name)) {
                return (...args: unknown[]) =>
                    createLiveExpression(
                        `${nextExpression}(${args.map(pythonLiteral).join(", ")})`,
                        metadata.methodTypes[name] ?? "unknown",
                    );
            }
            return createLiveExpression(
                nextExpression,
                metadata?.properties[name] ?? "unknown",
            );
        },
    });

const createLiveTarget = <T>(
    expression: string,
    typeName: string,
): LiveUpdateTarget<T> =>
    new Proxy({ expression } as LiveUpdateTarget<T>, {
        get(target, property) {
            if (property === "expression") return target.expression;
            if (property === "then") return undefined;
            if (property === "object")
                return createLiveMembers<T>("object", typeName);
            const name = String(property);
            const metadata = typeMetadata(typeName);
            const nextExpression = `${target.expression}.${name}`;
            if (metadata?.methods.includes(name)) {
                return (...args: unknown[]) =>
                    createLiveTarget(
                        `${nextExpression}(${args.map(pythonLiteral).join(", ")})`,
                        metadata.methodTypes[name] ?? "unknown",
                    );
            }
            return createLiveTarget(
                nextExpression,
                metadata?.properties[name] ?? "unknown",
            );
        },
    });

const createLiveSubsystem = (): LiveUpdateSubsystem =>
    new Proxy({} as LiveUpdateSubsystem, {
        get(_target, property) {
            const name = String(property);
            return createLiveTarget(`subsystem:${name}`, name);
        },
    });

/** A separate live-update channel which reuses the session from a connection. */
export class LiveUpdate {
    public readonly subsystem: LiveUpdateSubsystem = createLiveSubsystem();

    private socket?: LiveUpdateSocket;
    private subscriptions = new Map<number, LiveUpdateSubscription>();
    private listeners = new Map<number, Set<LiveUpdateListener>>();
    private allListeners = new Set<LiveUpdateListener>();
    private pendingSubscriptionLists: Array<{
        resolve: (value: ReadonlyArray<LiveUpdateSubscription>) => void;
        reject: (reason: unknown) => void;
    }> = [];
    private connectionPromise?: Promise<void>;

    public constructor(
        private readonly session: D3Session,
        private readonly socketFactory: LiveUpdateSocketFactory = (url) =>
            new WebSocket(url) as unknown as LiveUpdateSocket,
    ) {}

    public get connected() {
        return this.socket?.readyState === OPEN;
    }

    public get currentSubscriptions(): ReadonlyArray<LiveUpdateSubscription> {
        return [...this.subscriptions.values()];
    }

    public async connect(): Promise<void> {
        if (this.connected) return;
        if (this.connectionPromise) return this.connectionPromise;

        this.connectionPromise = new Promise<void>((resolve, reject) => {
            const socket = this.socketFactory(
                getLiveUpdateUrl(this.session.hostname, this.session.port),
            );
            this.socket = socket;
            socket.onopen = () => resolve();
            socket.onerror = () =>
                reject(new Error("Live update connection failed"));
            socket.onclose = () => {
                this.socket = undefined;
                this.rejectPending(new Error("Live update connection closed"));
            };
            socket.onmessage = (event) => this.receive(event.data);
        }).finally(() => {
            this.connectionPromise = undefined;
        });
        return this.connectionPromise;
    }

    public async subscribe(
        objectPath: string | LiveUpdateExpression,
        propertyPaths: LiveUpdatePropertyPaths,
        configuration?: LiveUpdateConfiguration,
    ): Promise<ReadonlyArray<LiveUpdateSubscription>> {
        await this.connect();
        return this.requestSubscriptionList({
            subscribe: {
                object: isExpression(objectPath)
                    ? objectPath.expression
                    : objectPath,
                properties:
                    typeof propertyPaths === "string"
                        ? [propertyPaths]
                        : isExpression(propertyPaths)
                          ? [propertyPaths.expression]
                          : propertyPaths.map((property) =>
                                isExpression(property)
                                    ? property.expression
                                    : property,
                            ),
                ...(configuration ? { configuration } : {}),
            },
        });
    }

    public async unsubscribe(
        id: number | ReadonlyArray<number>,
    ): Promise<ReadonlyArray<LiveUpdateSubscription>> {
        await this.connect();
        return this.requestSubscriptionList({
            unsubscribe: Array.isArray(id) ? { ids: [...id] } : { id },
        });
    }

    /** Watch the session playhead position. */
    public watchPlayhead(configuration?: LiveUpdateConfiguration) {
        return this.subscribe(
            "transportmanager:default",
            "object.player.tRender",
            configuration,
        );
    }

    /** Watch commonly useful timing and layer data for a track. */
    public watchTrack(
        trackName: string,
        propertyPaths: LiveUpdatePropertyPaths = [
            "object.lengthInBeats",
            "object.layers",
        ],
        configuration?: LiveUpdateConfiguration,
    ) {
        return this.subscribe(
            `track:${this.resourceIdentifier(trackName)}`,
            propertyPaths,
            configuration,
        );
    }

    /** Watch commonly useful display metadata for a screen. */
    public watchScreen(
        screenName: string,
        propertyPaths: LiveUpdatePropertyPaths = [
            "object.description",
            "object.offset",
        ],
        configuration?: LiveUpdateConfiguration,
    ) {
        return this.subscribe(
            `screen2:${this.resourceIdentifier(screenName)}`,
            propertyPaths,
            configuration,
        );
    }

    /** Watch the latest local FPS monitoring value. */
    public watchFps(
        monitorName = "fps",
        configuration?: LiveUpdateConfiguration,
    ) {
        return this.subscribe(
            `subsystem:MonitoringManager.findLocalMonitor(${JSON.stringify(monitorName)})`,
            'object.seriesAverage("Actual", 1)',
            configuration,
        );
    }

    /** Watch receive statuses for all machines in a RenderStream workload. */
    public watchRenderStreamWorkload(
        workloadId: LiveUpdateIdentifier,
        configuration?: LiveUpdateConfiguration,
    ) {
        return this.subscribe(
            "subsystem:RenderStreamSystem",
            `object.getWorkloadReceiveStatuses(${this.pythonArgument(workloadId)})`,
            configuration,
        );
    }

    /** Watch receive status for one machine in a RenderStream workload. */
    public watchRenderStreamMachine(
        workloadId: LiveUpdateIdentifier,
        machineName: string,
        configuration?: LiveUpdateConfiguration,
    ) {
        return this.subscribe(
            "subsystem:RenderStreamSystem",
            `object.getStreamReceiveStatuses(${this.pythonArgument(workloadId)}, ${JSON.stringify(machineName)})`,
            configuration,
        );
    }

    /** Watch health for one RenderStream workload instance. */
    public watchRenderStreamInstance(
        workloadId: LiveUpdateIdentifier,
        instanceIndex: number,
        configuration?: LiveUpdateConfiguration,
    ) {
        return this.subscribe(
            "subsystem:RenderStreamSystem",
            `object.getWorkloadInstance(${this.pythonArgument(workloadId)}, ${instanceIndex}).health()`,
            configuration,
        );
    }

    /** Watch whether a machine has taken over a failed machine. */
    public watchMachineFailover(
        machineName: string,
        configuration?: LiveUpdateConfiguration,
    ) {
        return this.subscribe(
            `Machine:${JSON.stringify(machineName)}`,
            "object.hasTakenOverFailedMachine()",
            configuration,
        );
    }

    public onUpdate(listener: LiveUpdateListener) {
        this.allListeners.add(listener);
        return () => this.allListeners.delete(listener);
    }

    public onSubscriptionUpdate(id: number, listener: LiveUpdateListener) {
        const listeners = this.listeners.get(id) ?? new Set();
        listeners.add(listener);
        this.listeners.set(id, listeners);
        return () => listeners.delete(listener);
    }

    public close() {
        this.socket?.close();
        this.socket = undefined;
        this.subscriptions.clear();
        this.listeners.clear();
        this.rejectPending(new Error("Live update connection closed"));
    }

    private requestSubscriptionList(message: unknown) {
        return new Promise<ReadonlyArray<LiveUpdateSubscription>>(
            (resolve, reject) => {
                this.pendingSubscriptionLists.push({ resolve, reject });
                this.socket!.send(JSON.stringify(message));
            },
        );
    }

    private receive(raw: string) {
        const message = JSON.parse(raw) as {
            subscriptions?: LiveUpdateSubscription[];
            valuesChanged?: LiveUpdateValueChange[];
            error?: string;
        };
        if (message.error) {
            this.rejectPending(new Error(message.error));
            return;
        }
        if (message.subscriptions) {
            this.subscriptions = new Map(
                message.subscriptions.map((subscription) => [
                    subscription.id,
                    subscription,
                ]),
            );
            this.pendingSubscriptionLists
                .shift()
                ?.resolve(this.currentSubscriptions);
        }
        for (const change of message.valuesChanged ?? []) {
            const subscription = this.subscriptions.get(change.id);
            for (const listener of this.listeners.get(change.id) ?? [])
                listener(change, subscription);
            for (const listener of this.allListeners)
                listener(change, subscription);
        }
    }

    private rejectPending(error: Error) {
        for (const pending of this.pendingSubscriptionLists)
            pending.reject(error);
        this.pendingSubscriptionLists = [];
    }

    private pythonArgument(value: LiveUpdateIdentifier) {
        return typeof value === "number"
            ? String(value)
            : JSON.stringify(value);
    }

    private resourceIdentifier(name: string) {
        return name.trim().replace(/\s+/g, "_");
    }
}
