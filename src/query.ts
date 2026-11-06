import type {
    DesignerType,
    DesignerValue,
    DisguiseConnection,
    UnwrapDesigner,
} from "./disguise.js";

type QueryExecutor = Pick<
    DisguiseConnection,
    "expression" | "executeExpression"
>;

export class QuerySelection<T> {
    public constructor(
        private readonly connection: QueryExecutor,
        private readonly expression: string,
    ) {}

    /** Execute the projection as one request and return structured data. */
    public get(): Promise<T> {
        return this.connection.executeExpression<T>(this.expression);
    }
}

export class QueryCollection<T> {
    public constructor(
        private readonly connection: QueryExecutor,
        private readonly expression: string,
        private readonly typeName: string,
    ) {}

    /** Build a typed Designer-side projection. */
    public select<U>(
        selector: (item: DesignerValue<T>) => U,
    ): QuerySelection<UnwrapDesigner<U>[]> {
        const source = this.connection.expression<ReadonlyArray<T>>(
            this.expression,
            `ReadonlyArray<${this.typeName}>`,
        );
        const selected = source.map(selector);
        return new QuerySelection(this.connection, selected.expression);
    }

    public get(): Promise<ReadonlyArray<T>> {
        return this.connection.executeExpression<ReadonlyArray<T>>(
            this.expression,
        );
    }
}

/** Typed query entry point for efficient Designer-side projections. */
export class Query {
    public constructor(private readonly connection: QueryExecutor) {}

    public all<T>(type: DesignerType<T>): QueryCollection<T> {
        const resourceClass = type.expression.replace(/^.*</, "");
        const path = resourceClass.toLowerCase();
        return new QueryCollection(
            this.connection,
            `[resourceManager.load(Path(p), ${resourceClass}) for p in resourceManager.search("objects/${path}")]`,
            resourceClass,
        );
    }
}
