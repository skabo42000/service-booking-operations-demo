export const SALON_NAME = "Studio Princess";
export const CITY = "Banja Luka";
export const INSTAGRAM_URL = "https://www.instagram.com/studio_princess_bl";
export const FACEBOOK_URL = "https://www.facebook.com/princess.banjaluka/";

export const CATEGORIES = [
  {
    id: "nokti",
    name: "Nokti",
    eyebrow: "Njega i stil",
    description: "Odaberite tretman za nokte i pogledajte slobodne demo termine.",
    detail: "Probna ponuda za njegu noktiju; detaljan spisak tretmana još nije potvrđen.",
    bookable: true,
  },
  {
    id: "kosa",
    name: "Kosa",
    eyebrow: "Vaš novi izgled",
    description: "Odaberite uslugu za kosu i termin koji vam odgovara.",
    detail: "Vrijeme za osvježenje frizure i trenutak samo za vas.",
    bookable: true,
  },
  {
    id: "depilacija",
    name: "Depilacija",
    eyebrow: "Njega tijela",
    description: "Pogledajte slobodne demo termine za depilaciju.",
    detail: "Jednostavno zakažite vrijeme za željenu njegu.",
    bookable: true,
  },
  {
    id: "solarijum",
    name: "Solarijum",
    eyebrow: "Bez prethodne rezervacije",
    description: "Za solarijum nije potrebno zakazivanje termina.",
    detail: "Dodatne informacije potražite na zvaničnim profilima salona.",
    bookable: false,
  },
] as const;
