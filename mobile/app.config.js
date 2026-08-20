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
  },
}
