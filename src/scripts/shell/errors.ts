// No error goes unseen: an uncaught error or an unhandled rejection is
// logged (AGENTS.md, "Never swallow an error"). Imported first by
// shell.ts, so it listens before any other module of the page runs.

window.addEventListener("error", (event) => {
  console.error("[Global Error]", event.error ?? event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled Promise Rejection]", event.reason);
});
