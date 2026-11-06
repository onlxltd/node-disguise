import type { D3Session } from "./session.js";

/** A resource can be addressed by exactly one stable identifier. */
export type ResourceLocator =
    { uid: string; name?: never } | { name: string; uid?: never };

export type TransportLocator = ResourceLocator;
export type TrackLocator = ResourceLocator;
export type TransportPlayMode = "play" | "playsection" | "playloopsection";

export interface TransportTrack {
    uid: string;
    name: string;
    length: number;
    crossfade: string;
}

export interface TransportState {
    uid: string;
    name: string;
    engaged: boolean;
    volume: number;
    brightness: number;
    playmode: string;
    currentTrack: Pick<TransportTrack, "uid" | "name">;
    receivingTimecode: boolean;
    setList: {
        uid: string;
        name: string;
        tracks: ReadonlyArray<TransportTrack>;
    };
}

export interface MultiTransportState {
    uid: string;
    name: string;
    engaged: boolean;
    transports: ReadonlyArray<string>;
}

export interface AllTransports {
    transports: ReadonlyArray<TransportState>;
    multitransports: ReadonlyArray<MultiTransportState>;
}

export interface TransportTrackSummary {
    uid: string;
    name: string;
    length: number;
    crossfade: string;
}

export interface TransportSetListSummary {
    uid: string;
    name: string;
    tracks: ReadonlyArray<TransportTrackSummary>;
}

export interface TransportCommandResponse {
    status: unknown;
}

interface TransportListResponse extends TransportCommandResponse {
    transports: ReadonlyArray<TransportState>;
    multitransports: ReadonlyArray<MultiTransportState>;
}

interface ResultResponse<T> extends TransportCommandResponse {
    result: T;
}

export interface TransportAnnotation {
    time: number;
    text?: string;
    type?: string;
    value?: string;
    index?: string;
}

export interface TransportAnnotations {
    notes: ReadonlyArray<TransportAnnotation>;
    tags: ReadonlyArray<TransportAnnotation>;
    sections: ReadonlyArray<TransportAnnotation>;
}

export interface TransportAnnotationsResult {
    uid: string;
    name: string;
    annotations: TransportAnnotations;
}

const locator = (value: ResourceLocator) => ({ ...value });

/** Typed client for Designer's session transport API. */
export class TransportClient {
    public constructor(private readonly session: D3Session) {}

    public async all(): Promise<AllTransports> {
        const response = await this.session.request<TransportListResponse>(
            "GET",
            "api/session/transport/transports",
        );
        return {
            transports: response.transports,
            multitransports: response.multitransports,
        };
    }

    public async active(): Promise<ReadonlyArray<TransportState>> {
        return (
            await this.session.request<
                ResultResponse<ReadonlyArray<TransportState>>
            >("GET", "api/session/transport/activetransport")
        ).result;
    }

    public async annotations(
        track: TrackLocator,
    ): Promise<TransportAnnotationsResult> {
        const params = new URLSearchParams(
            track.uid !== undefined ? { uid: track.uid } : { name: track.name },
        );
        return (
            await this.session.request<
                ResultResponse<TransportAnnotationsResult>
            >("GET", `api/session/transport/annotations?${params}`)
        ).result;
    }

    public async setlists(): Promise<ReadonlyArray<TransportSetListSummary>> {
        return (
            await this.session.request<
                ResultResponse<ReadonlyArray<TransportSetListSummary>>
            >("GET", "api/session/transport/setlists")
        ).result;
    }

    public async tracks(): Promise<ReadonlyArray<TransportTrackSummary>> {
        return (
            await this.session.request<
                ResultResponse<ReadonlyArray<TransportTrackSummary>>
            >("GET", "api/session/transport/tracks")
        ).result;
    }

    public play(transport: TransportLocator) {
        return this.command("play", { transports: [locator(transport)] });
    }

    public playLoopSection(transport: TransportLocator) {
        return this.command("playloopsection", {
            transports: [locator(transport)],
        });
    }

    public playSection(transport: TransportLocator) {
        return this.command("playsection", {
            transports: [locator(transport)],
        });
    }

    public stop(transport: TransportLocator) {
        return this.command("stop", { transports: [locator(transport)] });
    }

    public returnToStart(transport: TransportLocator) {
        return this.command("returntostart", {
            transports: [locator(transport)],
        });
    }

    public brightness(transport: TransportLocator, brightness: number) {
        return this.command("brightness", {
            transports: [{ transport: locator(transport), brightness }],
        });
    }

    public engaged(transport: TransportLocator, engaged: boolean) {
        return this.command("engaged", {
            transports: [{ transport: locator(transport), engaged }],
        });
    }

    public volume(transport: TransportLocator, volume: number) {
        return this.command("volume", {
            transports: [{ transport: locator(transport), volume }],
        });
    }

    public goToFrame(
        transport: TransportLocator,
        frame: number,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gotoframe", {
            transports: [{ transport: locator(transport), frame, playmode }],
        });
    }

    public goToNote(
        transport: TransportLocator,
        note: string,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gotonote", {
            transports: [{ transport: locator(transport), note, playmode }],
        });
    }

    public goToSection(
        transport: TransportLocator,
        section: string,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gotosection", {
            transports: [{ transport: locator(transport), section, playmode }],
        });
    }

    public goToTime(
        transport: TransportLocator,
        time: number,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gototime", {
            transports: [{ transport: locator(transport), time, playmode }],
        });
    }

    public goToTimecode(
        transport: TransportLocator,
        timecode: string,
        options: { ignoreTags?: boolean; playmode?: TransportPlayMode } = {},
    ) {
        return this.command("gototimecode", {
            transports: [
                { transport: locator(transport), timecode, ...options },
            ],
        });
    }

    public goToTrack(
        transport: TransportLocator,
        track: TrackLocator,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gototrack", {
            transports: [
                {
                    transport: locator(transport),
                    track: locator(track),
                    playmode,
                },
            ],
        });
    }

    public goToNextSection(
        transport: TransportLocator,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gotonextsection", {
            transports: [{ transport: locator(transport), playmode }],
        });
    }

    public goToNextTrack(
        transport: TransportLocator,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gotonexttrack", {
            transports: [{ transport: locator(transport), playmode }],
        });
    }

    public goToPreviousSection(
        transport: TransportLocator,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gotoprevsection", {
            transports: [{ transport: locator(transport), playmode }],
        });
    }

    public goToPreviousTrack(
        transport: TransportLocator,
        playmode?: TransportPlayMode,
    ) {
        return this.command("gotoprevtrack", {
            transports: [{ transport: locator(transport), playmode }],
        });
    }

    public goToTag(
        transport: TransportLocator,
        type: string,
        value: string,
        options: {
            allowGlobalJump?: boolean;
            playmode?: TransportPlayMode;
        } = {},
    ) {
        return this.command("gototag", {
            transports: [
                { transport: locator(transport), type, value, ...options },
            ],
        });
    }

    private command(endpoint: string, body: unknown) {
        return this.session.request<TransportCommandResponse>(
            "POST",
            `api/session/transport/${endpoint}`,
            {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            },
        );
    }
}
