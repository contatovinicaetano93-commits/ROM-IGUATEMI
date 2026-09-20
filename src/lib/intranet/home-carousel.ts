export type HomeCarouselSlide = {
  src: string
  alt: string
  href?: string | null
  objectPosition?: string
}

/** Slides estáticos da home — marketing pode sobrescrever com posts `banner` + image_url. */
export const DEFAULT_HOME_CAROUSEL: readonly HomeCarouselSlide[] = [
  {
    src: '/intranet/carousel/salon-wide.jpg',
    alt: 'ROM Club — estações de atendimento',
    objectPosition: 'center',
  },
  {
    src: '/intranet/carousel/lounge-wide.jpg',
    alt: 'ROM Club — lounge',
    objectPosition: 'center 35%',
  },
  {
    src: '/intranet/carousel/rom-concept-tray-wide.jpg',
    alt: 'ROM Concept — bandeja de serviço',
    objectPosition: 'center 40%',
  },
  {
    src: '/intranet/carousel/cafe-wide.jpg',
    alt: 'ROM Concept — café e detalhes',
    objectPosition: 'center',
  },
]

export type BannerPostLike = {
  id: string
  title: string
  excerpt?: string
  body?: string
  image_url?: string | null
  href?: string | null
}

/** Prefer banners publicados com imagem; senão cai nos slides padrão. */
export function resolveHomeCarouselSlides(
  banners: readonly BannerPostLike[],
  defaults: readonly HomeCarouselSlide[] = DEFAULT_HOME_CAROUSEL,
): HomeCarouselSlide[] {
  const fromCms = banners
    .filter((post) => typeof post.image_url === 'string' && post.image_url.trim().length > 0)
    .map((post) => ({
      src: post.image_url!.trim(),
      alt: post.title,
      href: post.href ?? null,
      objectPosition: 'center',
    }))
  return fromCms.length > 0 ? fromCms : [...defaults]
}
