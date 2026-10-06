import { Component, type ReactNode } from "react";

/** Last line of defence: a crash in one screen shows a message and a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" style={{ maxWidth: 480, margin: "20vh auto", padding: 24, textAlign: "center", fontFamily: "inherit" }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p style={{ margin: "8px 0 20px", opacity: 0.7 }}>This screen hit an unexpected problem. Reloading usually fixes it.</p>
        <button type="button" onClick={() => location.reload()} style={{ font: "inherit", fontWeight: 600, padding: "10px 20px", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}>Reload</button>
      </main>
    );
  }
}
