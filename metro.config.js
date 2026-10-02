const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // On web, swap react-native-google-mobile-ads for a no-op stub
  if (platform === 'web' && moduleName === 'react-native-google-mobile-ads') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'src/utils/admob-stub.js'),
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
