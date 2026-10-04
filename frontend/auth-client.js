window.InstaDownAuth = (() => {
  let clientPromise;
  async function getClient() {
    if (!clientPromise) {
      clientPromise = fetch('/api/config').then(async response => {
        if (!response.ok) throw new Error('Could not load authentication configuration.');
        const config = await response.json();
        if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Supabase authentication is not configured on the server.');
        if (!window.supabase) throw new Error('Supabase client failed to load.');
        return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      });
    }
    return clientPromise;
  }
  async function session() {
    const client = await getClient();
    const { data } = await client.auth.getSession();
    return data.session || null;
  }
  async function user() {
    const client = await getClient();
    const { data } = await client.auth.getUser();
    return data.user || null;
  }
  async function signInWithGoogle() {
    const client = await getClient();
    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` }
    });
  }
  async function signOut() {
    const client = await getClient();
    await client.auth.signOut();
  }
  return { getClient, session, user, signInWithGoogle, signOut };
})();
