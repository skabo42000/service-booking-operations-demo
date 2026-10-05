// Staff area sections: each one has its own URL, so back, refresh and bookmarks keep you where you were.
export const ADMIN_SECTIONS = [
  { slug: "kalendar", tab: "calendar", label: "Kalendar", staffLabel: "Moji termini", ownerOnly: false, staffOnly: false },
  { slug: "klijenti", tab: "clients", label: "Klijenti", staffLabel: "", ownerOnly: true, staffOnly: false },
  { slug: "tim", tab: "team", label: "Tim", staffLabel: "", ownerOnly: true, staffOnly: false },
  { slug: "usluge", tab: "services", label: "Usluge", staffLabel: "", ownerOnly: true, staffOnly: false },
  { slug: "rasporedi", tab: "shifts", label: "Rasporedi", staffLabel: "", ownerOnly: true, staffOnly: false },
  { slug: "izvjestaji", tab: "reports", label: "Izvještaji", staffLabel: "", ownerOnly: true, staffOnly: false },
  { slug: "moj-raspored", tab: "mine", label: "", staffLabel: "Moj raspored", ownerOnly: false, staffOnly: true },
] as const;

export type AdminTab = (typeof ADMIN_SECTIONS)[number]["tab"];
