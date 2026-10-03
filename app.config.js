// Extends app.json. Google Sign-In's plugin only does work on iOS (URL scheme);
// it is added once an iOS OAuth client exists, since it throws without one.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) return config;

  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]],
  };
};
