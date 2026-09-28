(async function init() {
  const loadingState = document.getElementById('loadingState');
  const setupForm = document.getElementById('setupForm');
  const loginForm = document.getElementById('loginForm');

  // If already logged in, skip straight to the dashboard.
  try {
    await API.get('/auth/me');
    window.location.href = '/app.html';
    return;
  } catch (e) { /* not logged in, continue */ }

  try {
    const status = await API.get('/setup/status');
    loadingState.classList.add('hidden');
    if (status.setupComplete) {
      loginForm.classList.remove('hidden');
    } else {
      setupForm.classList.remove('hidden');
    }
  } catch (e) {
    loadingState.textContent = 'Could not reach the server. Is it running?';
  }

  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('setupError');
    errBox.classList.add('hidden');
    const fd = new FormData(setupForm);
    try {
      await API.post('/setup/owner', Object.fromEntries(fd.entries()));
      window.location.href = '/app.html';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('loginError');
    errBox.classList.add('hidden');
    const fd = new FormData(loginForm);
    try {
      await API.post('/auth/login', Object.fromEntries(fd.entries()));
      window.location.href = '/app.html';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  document.getElementById('forgotBtn').addEventListener('click', () => {
    document.getElementById('forgotNote').classList.remove('hidden');
  });
})();
