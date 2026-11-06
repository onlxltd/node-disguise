import DisguiseConnection from '../src'

const hostname      = process.env.HOST ?? '127.0.0.1'

const connection    = new DisguiseConnection({ hostname })
const tracks        = await connection.d3.guisystem.track.layers.map((i) => {
        return {
            id: i.uid,
            name: i.name,
            start: i.tStart,
        };
    })
    .get()

console.log(`Connected to ${hostname}`)
console.log(tracks)