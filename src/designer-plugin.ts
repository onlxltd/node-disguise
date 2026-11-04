import { readFile } from "fs/promises";
import os from "os";
import { Bonjour, Service } from "bonjour-service";

export interface DesignerPluginOptions {
    name: string;
    port: number;
    hostname?: string;
    url?: string;
    requiresSession?: boolean;
    isDisguise?: boolean;
}

export class DesignerPlugin {
    public readonly name: string;
    public readonly port: number;
    public readonly hostname: string;
    public readonly url: string;
    public readonly requiresSession: boolean;
    public readonly isDisguise: boolean;
    private bonjour?: Bonjour;
    private service?: Service;
    public constructor(options: DesignerPluginOptions) {
        this.name = options.name;
        this.port = options.port;
        this.hostname = options.hostname ?? os.hostname();
        this.url = options.url ?? `http://${this.hostname}:${this.port}`;
        this.requiresSession = options.requiresSession ?? false;
        this.isDisguise = options.isDisguise ?? false;
    }

    public static async fromJsonFile(
        filePath: string,
        port: number,
        hostname?: string,
    ) {
        const config = JSON.parse(await readFile(filePath, "utf8")) as Record<
            string,
            unknown
        >;
        if (typeof config.name !== "string")
            throw new Error("d3plugin.json must contain a name");
        return new DesignerPlugin({
            name: config.name,
            port,
            hostname,
            url: config.url as string | undefined,
            requiresSession: config.requiresSession as boolean | undefined,
            isDisguise: config.isDisguise as boolean | undefined,
        });
    }

    public static defaultInit(port: number, hostname?: string) {
        return DesignerPlugin.fromJsonFile("./d3plugin.json", port, hostname);
    }

    public start() {
        this.bonjour = new Bonjour();
        this.service = this.bonjour.publish({
            name: this.name,
            type: "d3plugin",
            protocol: "tcp",
            port: this.port,
            host: `${this.hostname}.local`,
            txt: {
                t: "web",
                s: String(this.requiresSession),
                d: String(this.isDisguise),
                ...(this.url ? { u: this.url } : {}),
            },
        });
        return this;
    }

    public stop() {
        this.service?.stop();
        this.bonjour?.destroy();
        this.service = undefined;
        this.bonjour = undefined;
    }
}
