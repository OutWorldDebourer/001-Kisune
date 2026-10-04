import type { ImageMetadata } from 'astro';
import { photoFor } from './photos';
import california from '../assets/generated/california-v1.webp';
import furai from '../assets/generated/furai-v1.webp';
import acevichado from '../assets/generated/acevichado-v1.webp';
import garlic from '../assets/generated/garlic-v1.webp';
import kitsune from '../assets/generated/kitsune-v1.webp';
import parmesano from '../assets/generated/parmesano-v1.webp';
import parrillero from '../assets/generated/parrillero-v1.webp';
import yakiniku from '../assets/generated/yakiniku-v1.webp';
import matchaCaramel from '../assets/generated/matcha-caramel-v1.webp';
import teJazmin from '../assets/generated/te-jazmin-v1.webp';

// Conceptual illustrations generated with image_gen, not photographs of served portions.
const illustrations: Record<string, ImageMetadata> = {
  California: california, Furai: furai, Acevichado: acevichado, Garlic: garlic,
  Kitsune: kitsune, Parmesano: parmesano, Parrillero: parrillero, Yakiniku: yakiniku,
  'Matcha Caramel Latte': matchaCaramel, 'Té de Jazmín': teJazmin,
};

export function visualFor(name: string) {
  const photo = photoFor(name);
  const image = photo ?? illustrations[name];
  return image ? { image, generated: !photo } : undefined;
}
