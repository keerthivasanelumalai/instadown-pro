(async function () {
  const button   = document.getElementById("googleSignIn");
  const alertBox = document.getElementById("authAlert");
  const alertMsg = document.getElementById("authAlertMsg");

  function showError(message) {
    if (alertMsg) alertMsg.textContent = message;
    else if (alertBox) alertBox.textContent = message;
    alertBox.classList.add("show");
  }

  const GOOGLE_SVG = `<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.78-.07-1.53-.22-2.25H12v4.26h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.4z"/><path fill="#34A853" d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.04H3.27v2.53A9.75 9.75 0 0 0 12 21.6z"/><path fill="#FBBC05" d="M6.51 13.67A5.86 5.86 0 0 1 6.2 12c0-.58.1-1.15.31-1.67V7.8H3.27A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.02 4.2l3.24-2.53z"/><path fill="#EA4335" d="M12 6.29c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.83 3.34 14.63 2.4 12 2.4a9.75 9.75 0 0 0-8.73 5.4l3.24 2.53C7.29 8.01 9.45 6.29 12 6.29z"/></svg>Continue with Google`;

  function setLoading(loading) {
    button.disabled = loading;
    button.innerHTML = loading
      ? '<div class="btn-spinner"></div>Connecting to Google...'
      : GOOGLE_SVG;
  }

  // If already logged in, redirect home immediately
  try {
    const session = await InstaDownAuth.session();
    if (session) { window.location.href = "/"; return; }
  } catch (e) { showError(e.message); }

  button.addEventListener("click", async () => {
    alertBox.classList.remove("show");
    setLoading(true);
    try {
      const { error } = await InstaDownAuth.signInWithGoogle();
      if (error) throw error;
      // Supabase redirects the browser to Google — no further action needed here
    } catch (error) {
      showError(error.message || "Google sign-in failed. Please try again.");
      setLoading(false);
    }
  });
})();
