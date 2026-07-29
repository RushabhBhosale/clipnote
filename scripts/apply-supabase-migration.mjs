import { readFile } from 'node:fs/promises'
import { Client } from 'pg'

function readEnvironment(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    if (!line || line.startsWith('#')) return []
    const separator = line.indexOf('=')
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : []
  }))
}

const environment = readEnvironment(await readFile(new URL('../.env', import.meta.url), 'utf8'))
const url = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL
if (!url || !environment.supabase_pass) throw new Error('SUPABASE_URL and supabase_pass are required in .env.')

const projectRef = new URL(url).hostname.split('.')[0]
const client = new Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password: environment.supabase_pass,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

await client.connect()
await client.query(await readFile(new URL('../supabase/migrations/001_clip_sync.sql', import.meta.url), 'utf8'))
await client.end()
console.log('ClipNote sync migration applied.')
