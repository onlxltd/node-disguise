
import DisguiseConnection from '../src'

const hostname      = process.env.HOST ?? '127.0.0.1'

const connection    = new DisguiseConnection({ hostname })
const query         = await connection.query
    .all(connection.types.Track)
    .select((track) => ({
        name: track.description,
        cues: track.cues.map((cue, i) => ({
            uid: cue.uid,
            beat: track.cues.getT(i),
            note: cue.note,
            section: cue.section,
            tags: cue.getTags().map((tag) => ({
                type: tag.type,
                text: tag.text,
            }))
        })),
        layers: track.layers.map((layer) => ({
            name: layer.name,
            start: layer.tStart,
            duration: layer.tLength,
            end: layer.tEnd,
        })),
    }))
    .get()

console.log("query", JSON.stringify(query, null, 4))