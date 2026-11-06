# node-disguise

Native Node.js and TypeScript client for connecting to a Disguise instance. It provides typed access to Designer objects and expressions, session transports, and live updates.

node-disguise is supported by [ON LX Limited](https://onlx.ltd/?src=node-disguise). Check out our projects such as [Ctrl Suite](https://onlx.ltd/ctrl-suite?src=node-disguise) and [Ctrl for iPad](https://onlx.ltd/ctrl-for-ipad?src=node-disguise).

## Requirements

- Node.js 24 or later
- Disguise Designer running and reachable over the network
- Designer's plugin API enabled and accessible from the machine running this client

## Install

#### Install with Yarn
```sh
yarn add node-disguise
```

#### Install with npm
```sh
npm install node-disguise
```

The examples in this repository use `tsx` and are available through npm scripts:

#### Run with yarn
```sh
yarn install
yarn example:list-transports
yarn example:list-tracks
yarn example:using-query
yarn example:live-update
```

#### Run with npm
```sh
npm install
npm run example:list-transports
npm run example:list-tracks
npm run example:using-query
npm run example:live-update
```

Set `HOST` to the Designer host when it is not running on the same machine. Examples default to `127.0.0.1`.

```sh
HOST=192.168.1.20 npm run example:list-transports
```

## Connect

Create a connection with the Designer hostname and, optionally, the plugin API port. The default port is `80`.

```ts
import DisguiseConnection from 'node-disguise'

const connection = new DisguiseConnection({
  hostname: process.env.HOST ?? '127.0.0.1',
  // port: 80,
})

const transports = await connection.transports.all()
console.log(transports)
```

The connection exposes `d3` for typed Designer object access, `query` for projections, `objects` for resource paths, `transports` for the session transport API, and `liveUpdate` for subscriptions.

## Examples

### List transports

Reads the transport and multi-transport state through Designer's session API.

```ts
import DisguiseConnection from 'node-disguise'

const hostname = process.env.HOST ?? '127.0.0.1'
const connection = new DisguiseConnection({ hostname })
const transports = await connection.transports.all()

console.log(`Connected to ${hostname}`)
console.log(transports)
```

### List track layers

Use the `d3` object proxy to create a typed Designer expression. The expression runs in Designer when `get()` is called.

```ts
import DisguiseConnection from 'node-disguise'

const hostname = process.env.HOST ?? '127.0.0.1'
const connection = new DisguiseConnection({ hostname })

const tracks = await connection.d3.guisystem.track.layers
  .map((layer) => ({
    id: layer.uid,
    name: layer.name,
    start: layer.tStart,
  }))
  .get()

console.log(`Connected to ${hostname}`)
console.log(tracks)
```

### Build a typed query

`query.all()` selects Designer resources by type. `select()` builds a projection that is evaluated as one request, which is useful for returning only the fields your application needs.

```ts
import DisguiseConnection from 'node-disguise'

const hostname = process.env.HOST ?? '127.0.0.1'
const connection = new DisguiseConnection({ hostname })

const result = await connection.query
  .all(connection.types.Track)
  .select((track) => ({
    name: track.description,
    cues: track.cues.map((cue, index) => ({
      uid: cue.uid,
      beat: track.cues.getT(index),
      note: cue.note,
      section: cue.section,
      tags: cue.getTags().map((tag) => ({
        type: tag.type,
        text: tag.text,
      })),
    })),
    layers: track.layers.map((layer) => ({
      name: layer.name,
      start: layer.tStart,
      duration: layer.tLength,
      end: layer.tEnd,
    })),
  }))
  .get()

console.log(JSON.stringify(result, null, 2))
```

### Subscribe to live updates

Live updates use a WebSocket connection. Subscribe to an object and one or more properties, register a listener, and close the socket when the process shuts down.

```ts
import DisguiseConnection from 'node-disguise'

const hostname = process.env.HOST ?? '127.0.0.1'
const connection = new DisguiseConnection({ hostname })
const liveUpdate = connection.liveUpdate

console.log(`Connected to ${hostname}`)

const fpsMonitor = liveUpdate.subsystem.MonitoringManager
  .findLocalMonitor('fps')

liveUpdate.subscribe(
  fpsMonitor,
  [fpsMonitor.object.seriesAverage('Actual', 1)],
  { updateFrequencyMs: 1000 },
)

liveUpdate.onUpdate((change, subscription) => {
  console.log(
    new Date().toISOString(),
    subscription?.objectPath,
    subscription?.propertyPath,
    change.value,
  )
})

const shutdown = () => {
  console.log('Closing live update connection')
  liveUpdate.close()
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

await new Promise<void>((resolve) => {
  process.once('SIGINT', resolve)
  process.once('SIGTERM', resolve)
})
```

## API notes

- `connection.transports.all()` returns transport and multi-transport state. The transport client also provides active transport, setlist, track, annotation, and control methods.
- Designer object properties are lazy expressions. Use `.get()` (or `.execute()`) to evaluate a property or mapped projection.
- `connection.query.all(connection.types.Track).get()` retrieves matching resources. Use `.select(...)` to project selected fields on the Designer side.
- Live-update subscriptions are event-driven; call `connection.liveUpdate.close()` when finished.

## Development

```sh
npm run build
npm test
npm run check
```

The checked-in Designer type declarations are generated in `src/d3-types.generated.ts`.

## License

MIT. See [LICENSE](LICENSE).
