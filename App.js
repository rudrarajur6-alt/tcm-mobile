import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  SafeAreaView, ActivityIndicator, Platform, TextInput,
  KeyboardAvoidingView, Image, ScrollView, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';

const RAGNOVA_BASE = 'https://thecloud.market';
const CRED_KEY = 'tcm_workspace_creds';

// CSS injected into every NC webview — hides the header and syncs theme
const NC_INJECT_JS = `
(function() {
  var style = document.createElement('style');
  style.textContent = \`
    #header, #theming-preview { display: none !important; }
    #content { margin-top: 0 !important; padding-top: 0 !important; }
    #body-user #content-vue,
    #body-user #app-content-vue,
    #body-user .app-content { margin-top: 0 !important; }
    main.app-content { height: 100vh !important; }
  \`;
  document.head.appendChild(style);
  true;
})();
`;

// Auto mail sync — detect empty NC Mail and trigger server-side resync
const MAIL_SYNC_JS = (subdomain, email) => `
(function() {
  setTimeout(function() {
    var isEmpty = !!(
      document.querySelector('.app-mail .empty-content') ||
      document.querySelector('.mail-setup') ||
      document.querySelector('[data-text="No mail accounts"]') ||
      (document.querySelector('#app-content-vue') && !document.querySelector('.envelope-list'))
    );
    if (isEmpty) {
      fetch('${RAGNOVA_BASE}/api/setup/resync-mail-app', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({subdomain: '${subdomain}', email: '${email}'})
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.ok) setTimeout(function() { location.reload(); }, 2000);
      }).catch(function(){});
    }
  }, 4000);
  true;
})();
`;

function tabsForCreds(creds) {
  const nc = creds.nc_url.replace(/\/$/, '');
  return [
    { key: 'email', label: 'Email', icon: '✉', url: nc + '/index.php/apps/mail/' },
    { key: 'files', label: 'Files', icon: '📁', url: nc + '/index.php/apps/files/' },
    { key: 'calendar', label: 'Calendar', icon: '📅', url: nc + '/index.php/apps/calendar/' },
    { key: 'talk', label: 'Talk', icon: '💬', url: nc + '/index.php/apps/spreed/' },
    { key: 'more', label: 'More', icon: '⋯', url: nc + '/index.php/apps/dashboard/' },
  ];
}

// ---------- Login Screen ----------
function LoginScreen({ onLogin }) {
  const [server, setServer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doLogin = useCallback(async () => {
    const s = server.trim();
    const e = email.trim();
    if (!s || !e || !password) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');
    const nc_url = s.startsWith('http') ? s : 'https://' + s;
    const creds = {
      nc_url,
      nc_user: e,
      nc_app_password: password,
      display_name: e.split('@')[0],
      email: e,
    };
    try {
      await SecureStore.setItemAsync(CRED_KEY, JSON.stringify(creds));
      onLogin(creds);
    } catch (err) {
      setError('Failed to save credentials.');
    }
    setLoading(false);
  }, [server, email, password, onLogin]);

  return (
    <KeyboardAvoidingView
      style={loginStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={loginStyles.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require('./assets/icon.png')} style={loginStyles.logo} />
        <Text style={loginStyles.title}>The Cloud Market</Text>
        <Text style={loginStyles.tagline}>Your workspace in the cloud</Text>

        <Text style={loginStyles.heading}>Sign in to your workspace</Text>

        <TextInput
          style={loginStyles.input}
          placeholder="yourcompany.thecloud.market"
          placeholderTextColor="#64748b"
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextInput
          style={loginStyles.input}
          placeholder="Email address"
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <TextInput
          style={loginStyles.input}
          placeholder="Password"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[loginStyles.button, loading && loginStyles.buttonDisabled]}
          onPress={doLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={loginStyles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {!!error && <Text style={loginStyles.error}>{error}</Text>}
        <Text style={loginStyles.muted}>
          Enter your workspace URL and credentials above.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------- Main App ----------
export default function App() {
  const [creds, setCreds] = useState(null);
  const [activeTab, setActiveTab] = useState('email');
  const [loading, setLoading] = useState({});
  const [booting, setBooting] = useState(true);
  const webViewRefs = useRef({});

  // Restore saved credentials
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(CRED_KEY);
        if (raw) setCreds(JSON.parse(raw));
      } catch {}
      setBooting(false);
    })();
  }, []);

  const handleLogin = useCallback((c) => {
    setCreds(c);
    setActiveTab('email');
  }, []);

  const handleLogout = useCallback(async () => {
    Alert.alert('Sign Out', 'Sign out of your workspace?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync(CRED_KEY);
          setCreds(null);
        },
      },
    ]);
  }, []);

  if (booting) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  if (!creds) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const tabs = tabsForCreds(creds);
  const subdomain = new URL(creds.nc_url).host;

  // Build Basic Auth header for NC requests
  const authHeader = 'Basic ' + btoa(creds.nc_user + ':' + creds.nc_app_password);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f1629" />

      {tabs.map(tab => (
        <View
          key={tab.key}
          style={[styles.webviewContainer, { display: activeTab === tab.key ? 'flex' : 'none' }]}
        >
          {loading[tab.key] && (
            <ActivityIndicator size="large" color="#22c55e" style={styles.loader} />
          )}
          <WebView
            ref={ref => webViewRefs.current[tab.key] = ref}
            source={{
              uri: tab.url,
              headers: { 'Authorization': authHeader },
            }}
            style={styles.webview}
            onLoadStart={() => setLoading(prev => ({ ...prev, [tab.key]: true }))}
            onLoadEnd={() => setLoading(prev => ({ ...prev, [tab.key]: false }))}
            injectedJavaScript={NC_INJECT_JS + (tab.key === 'email' ? MAIL_SYNC_JS(subdomain, creds.nc_user) : '')}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            allowsBackForwardNavigationGestures={true}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            userAgent={Platform.OS === 'ios'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            }
          />
        </View>
      ))}

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabIcon, activeTab === tab.key && styles.tabIconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
        {/* Sign out button */}
        <TouchableOpacity style={styles.tab} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.tabIcon}>⏻</Text>
          <Text style={styles.tabLabel}>Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const loginStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1629' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 32 },
  logo: { width: 72, height: 72, borderRadius: 18, alignSelf: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  tagline: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 32 },
  heading: { color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  input: {
    backgroundColor: 'rgba(15,22,41,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10, padding: 14, color: '#e2e8f0', fontSize: 14, marginBottom: 12,
  },
  button: {
    backgroundColor: '#22c55e', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#000', fontSize: 15, fontWeight: '600' },
  error: { color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 12 },
  muted: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1629' },
  webviewContainer: { flex: 1, position: 'relative' },
  webview: { flex: 1, backgroundColor: '#0f1629' },
  loader: { position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -20, zIndex: 10 },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#0f1629',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    paddingBottom: Platform.OS === 'ios' ? 20 : 4, height: Platform.OS === 'ios' ? 76 : 56,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  tabIcon: { fontSize: 22, marginBottom: 2, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 10, color: '#64748b', fontWeight: '500' },
  tabLabelActive: { color: '#22c55e', fontWeight: '600' },
});
