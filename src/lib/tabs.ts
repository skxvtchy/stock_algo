// Shared by the server page (reads the saved tab cookie) and the client AppShell.
// Keep this module free of "use client" so its values are usable on the server.
export const TAB_IDS = ["backtest", "trade", "account"] as const;
export type Tab = (typeof TAB_IDS)[number];

export const isTab = (v: string | undefined): v is Tab => TAB_IDS.includes(v as Tab);
