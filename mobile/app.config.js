const fs = require('node:fs')
const path = require('node:path')

function loadRootEnvironment() {
  const source = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    if (!line || line.startsWith('#')) return []
    const separator = line.indexOf('=')
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : []
  }))
}

const environment = loadRootEnvironment()

module.exports = {
  expo: {
    name: 'ClipNote',
    slug: 'clipnote',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ios: { bundleIdentifier: 'com.clipnote.mobile', supportsTablet: true },
    android: { package: 'com.clipnote.mobile' },
    extra: {
      supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.SUPABASE_URL,
      supabasePublishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.SUPABASE_PUBLISHABLE_KEY,
    },
  },
}
