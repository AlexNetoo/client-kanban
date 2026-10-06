import { useState, type ReactNode } from "react";
import { Button, Heading, SegmentedControl, Text } from "./halaska-kit";
import { PasswordDialog } from "./PasswordDialog";
import { useMe } from "./session";
import { usePalette, useThemePref, type ThemePref } from "./theme";
import { formatDateTime } from "./lib/format";
import { useEffect } from "react";

const LABEL: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };
const ROLE: Record<string, string> = { owner: "Admin", designer: "Designer", client: "Client" };

export function Settings() {
  const pal = usePalette();
  const me = useMe();
  const { pref, setPref } = useThemePref();
  const [pw, setPw] = useState(false);
  useEffect(() => { document.title = "Settings · Project Hub"; }, []);

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title} style={{ border: `1px solid ${pal.border}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>{children}
    </section>
  );

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ marginBottom: 8 }}><Heading level={1}>Settings</Heading><Text secondary>Your account and how the app looks.</Text></div>

      <Section title="Account">
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px 12px", fontSize: 14 }}>
          <dt style={{ color: pal.textSecondary }}>Signed in as</dt><dd style={{ margin: 0, fontWeight: 600 }}>{me.designer?.name ?? me.client?.name ?? ROLE[me.role]}</dd>
          <dt style={{ color: pal.textSecondary }}>Account type</dt><dd style={{ margin: 0 }}>{ROLE[me.role]}</dd>
          {me.expiresAt && <><dt style={{ color: pal.textSecondary }}>Session ends</dt><dd style={{ margin: 0 }}>{formatDateTime(new Date(me.expiresAt).toISOString())}</dd></>}
        </dl>
      </Section>

      <Section title="Appearance">
        <Text size="sm" secondary>Choose a theme. “System” follows your device.</Text>
        <div><SegmentedControl options={Object.values(LABEL)} value={LABEL[pref]} onChange={(label: string) => setPref((Object.keys(LABEL) as ThemePref[]).find((k) => LABEL[k] === label) ?? "system")} /></div>
      </Section>

      <Section title="Security">
        {me.role !== "owner" ? (
          <><Text size="sm" secondary>Change the password you use to sign in. Other devices are signed out.</Text><div><Button variant="secondary" onClick={() => setPw(true)}>Change password</Button></div></>
        ) : (
          <Text size="sm" secondary>The admin password is set in the server’s environment settings (APP_PASSWORD_HASH). Designer and client passwords are managed in the Admin console.</Text>
        )}
      </Section>
      {pw && <PasswordDialog onClose={() => setPw(false)} />}
    </div>
  );
}
