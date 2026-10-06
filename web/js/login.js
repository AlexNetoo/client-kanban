const form = document.getElementById('login');
const errorEl = document.getElementById('error');
const input = document.getElementById('password');
const button = form.querySelector('button');

if (new URLSearchParams(location.search).get('expired')) {
  errorEl.textContent = 'Your session ended. Please sign in again.';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  if (!input.value) { errorEl.textContent = 'Please enter the password.'; input.focus(); return; }
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Sign in failed.');
    // Keep the #/c/<token> fragment so shared client links land on the right project.
    location.replace('/' + location.hash);
  } catch (err) {
    errorEl.textContent = err.message;
    input.select();
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});
