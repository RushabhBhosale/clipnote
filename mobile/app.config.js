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
    version: '0.1.1',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#ffffff' },
    ios: { bundleIdentifier: 'com.clipnote.mobile', supportsTablet: true, icon: './assets/icon.png' },
    android: {
      package: 'com.clipnote.mobile',
      versionCode: 2,
      icon: './assets/icon.png',
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' },
    },
    web: { favicon: './assets/favicon.png' },
    extra: {
      supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.SUPABASE_URL,
      supabasePublishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.SUPABASE_PUBLISHABLE_KEY,
    },
  },
}
