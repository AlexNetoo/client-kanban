// Runs before first paint (loaded synchronously in <head>): applies the saved theme and decides whether the intro plays.
(function () {
  var h = document.documentElement;
  h.classList.add('js');
  try {
    var t = localStorage.getItem('ph-theme');
    h.setAttribute('data-theme', t === 'light' || t === 'dark' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    if (sessionStorage.getItem('intro')) h.classList.add('no-intro'); // the intro plays once per browser session
  } catch (e) { /* storage unavailable: just show the intro */ }
}());
