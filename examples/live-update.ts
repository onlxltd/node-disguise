import DisguiseConnection from '../src'

const hostname      = process.env.HOST ?? '127.0.0.1'

const connection    = new DisguiseConnection({ hostname })
const liveUpdate    = connection.liveUpdate

console.log(`Connected to ${hostname}`)

liveUpdate.subscribe(
    liveUpdate.subsystem.MonitoringManager.findLocalMonitor('fps'),
    [
        liveUpdate.subsystem.MonitoringManager.findLocalMonitor('fps').object.seriesAverage("Actual", 1),
    ],
    {
        updateFrequencyMs: 1000
    }
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
    console.log("Closing live update connection")
    liveUpdate.close()
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)

await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve)
    process.once("SIGTERM", resolve)
})