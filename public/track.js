(function () {
  try {
    var key = "sv_counted_" + location.hostname;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    navigator.sendBeacon("/api/track");
  } catch (e) {
    /* noop — tracking must never break the page */
  }
})();
