/**
 * Third-party assets used in the quote renders and how they must be credited. CC BY 4.0 requires naming the author and
 * the licence wherever the pictures are shown: the summary gallery, the configuration page and the PDF carry the short
 * line, /credite the full list.
 */
export interface RenderCredit {
  what: string;
  title: string;
  author: string;
  url: string;
  license: 'CC BY 4.0' | 'CC0';
}

export const RENDER_CREDITS: readonly RenderCredit[] = [
  { what: 'Autoturisme', title: 'Generic passenger car pack', author: 'Comrade1280', url: 'https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5', license: 'CC BY 4.0' },
  { what: 'Autoutilitară', title: 'European Delivery Van', author: 'Evan Hiltz', url: 'https://sketchfab.com/3d-models/european-delivery-van-0b2f1ad95a79419f9a092420024d329c', license: 'CC BY 4.0' },
  { what: 'Stivuitor', title: 'Forklift Truck', author: 'louis-muir', url: 'https://sketchfab.com/3d-models/forklift-truck-060f3f8bc7de4e6ca2f348d414702e9d', license: 'CC BY 4.0' },
  { what: 'Paleți', title: 'Game Ready Asset - Wood Pallet', author: 'poala', url: 'https://sketchfab.com/3d-models/game-ready-asset-wood-pallet-c3fd982e932b4ac6951c58200d08f913', license: 'CC BY 4.0' },
  { what: 'Arbuști', title: 'Hedge 01', author: 'Publicdomaintextures', url: 'https://sketchfab.com/3d-models/hedge-01-a4eff014b1a84d478d7297acf4eb6160', license: 'CC BY 4.0' },
  { what: 'Muncitori', title: 'Pete', author: 'drifter33', url: 'https://sketchfab.com/3d-models/pete-14cb64770751479094e2ca07fb5e4793', license: 'CC BY 4.0' },
  { what: 'Frunziș și scoarță copaci', title: 'Jacaranda Tree', author: 'Poly Haven', url: 'https://polyhaven.com/a/jacaranda_tree', license: 'CC0' },
  { what: 'Cer', title: 'Kloofendal 48d Partly Cloudy (Pure Sky)', author: 'Greg Zaal, Jarod Guest / Poly Haven', url: 'https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky', license: 'CC0' },
];

/** One line for under the pictures; `origin` makes the link absolute (in the PDF). */
export function renderCreditLine(origin = ''): string {
  const authors = RENDER_CREDITS.filter((c) => c.license === 'CC BY 4.0').map((c) => c.author);
  return `Decor 3D: modele de ${authors.join(', ')} (Sketchfab, CC BY 4.0). Lista completă: ${origin}/credite`;
}

export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/';
