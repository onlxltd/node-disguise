import DisguiseConnection from '../src'

const hostname      = process.env.HOST ?? '127.0.0.1'

const connection    = new DisguiseConnection({ hostname })
const transports    = await connection.transports.all()

console.log(`Connected to ${hostname}`)
console.log(transports)