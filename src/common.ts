import type { AllTransports } from "./transports.js";

/** Serializable summary of a layer belonging to a track. */
export interface TrackLayer {
    uid: number;
    name: string;
    start: number;
    end: number;
    enabled: boolean;
    type: unknown;
}

export interface TrackTag {
    type: number;
    text: string;
}

export interface TrackCue {
    uid: number;
    beat: number;
    note: string;
    section: boolean;
    tags: ReadonlyArray<TrackTag>;
}

/** Serializable summary of a track, its top-level layers, and cues. */
export interface TrackWithLayers {
    path: string;
    uid: number;
    name: string;
    bpm: number;
    lengthInBeats: number;
    lengthInSec: number;
    tcAdjust: number;
    triggerNote: string;
    layers: ReadonlyArray<TrackLayer>;
    cues: ReadonlyArray<TrackCue>;
}

interface ExpressionExecutor {
    executeExpression<T>(expression: string, timeoutMs?: number): Promise<T>;
    request<T>(endpoint: string): Promise<T>;
}

/** Common higher-level queries for Designer resources. */
export class Common {
    public constructor(private readonly connection: ExpressionExecutor) {}

    /**
     * Get every track in the project with its metadata, top-level layers,
     * cues, and cue tags.
     *
     * The query runs wholly in Designer because resource values returned over
     * the API cannot be navigated as live Designer objects.
     */
    public getAllTracks(): Promise<ReadonlyArray<TrackWithLayers>> {
        return this.connection.executeExpression<
            ReadonlyArray<TrackWithLayers>
        >(
            '[{"path": p, "uid": track.uid, "name": track.description, "bpm": track.bpm, "lengthInBeats": track.lengthInBeats, "lengthInSec": track.lengthInSec, "tcAdjust": track.tc_adjust, "triggerNote": track.trigger_note, "layers": [{"uid": layer.uid, "name": layer.name, "start": layer.tStart, "end": layer.tEnd, "enabled": layer.enabled, "type": layer.moduleType()} for layer in track.layers], "cues": [{"uid": cue.uid, "beat": cues.getT(i), "note": cue.note, "section": cue.section, "tags": [{"type": tag.type, "text": tag.text} for tag in cue.getTags()]} for i in range(cues.n()) for cue in [cues.getV(i)]]} for p in resourceManager.search("objects/track") for track in [resourceManager.load(Path(p), Track)] for cues in [track.cues]]',
        );
    }

    /** Get every transport manager and multitransport in the project. */
    public async getAllTransports(): Promise<AllTransports> {
        const response = await this.connection.request<
            AllTransports & { status: unknown }
        >("api/session/transport/transports");
        return {
            transports: response.transports,
            multitransports: response.multitransports,
        };
    }
}
