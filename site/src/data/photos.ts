// Fotos de producto extraídas del PDF, asignadas por CONTENIDO verificado con
// visión (no por nombre de archivo). Ver research/qa/images/ y map.json.
import p01x69 from '../assets/menu/p01_x69.jpeg';
import p01x88 from '../assets/menu/p01_x88.jpeg';
import p02x109 from '../assets/menu/p02_x109.jpeg';
import p02x136 from '../assets/menu/p02_x136.jpeg';
import p03x153 from '../assets/menu/p03_x153.jpeg';
import p03x159 from '../assets/menu/p03_x159.jpeg';
import p03x166 from '../assets/menu/p03_x166.jpeg';
import p03x175 from '../assets/menu/p03_x175.jpeg';
import p03x180 from '../assets/menu/p03_x180.jpeg';
import type { ImageMetadata } from 'astro';

export const photos = {
  // p01: página de portada
  rollTobiko: p01x69, // uramaki con tobiko y palta, con palillos
  rollSalmon: p01x88, // uramaki coronado con salmón
  // p02: página de makis
  platterVariety: p02x109, // bandeja variada de makis
  platterFried: p02x136, // roll frito con salsa anguila
  // p03: especiales y bebidas
  karage: p03x153, // karaage con salsa
  ebiFry: p03x159, // ebi fry / langostinos empanizados
  katsuCurry: p03x166, // katsukare (katsu curry con arroz)
  burgerMaki: p03x175, // roll crujiente con palta y anguila
  matcha: p03x180, // matcha latte con hielo
} satisfies Record<string, ImageMetadata>;

/** Foto por nombre de plato (solo donde existe foto verificada en el PDF). */
export const photoFor = (name: string): ImageMetadata | undefined => {
  const map: Record<string, ImageMetadata> = {
    Karage: photos.karage,
    'Ebi Furai': photos.ebiFry,
    Katsukare: photos.katsuCurry,
    Burguermaki: photos.burgerMaki,
    'Matcha Latte': photos.matcha,
  };
  return map[name];
};

/** Foto de producto para el hero (bandeja variada: la más representativa). */
export const heroPhoto = photos.platterVariety;
