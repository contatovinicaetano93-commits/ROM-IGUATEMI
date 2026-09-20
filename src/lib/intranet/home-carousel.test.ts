import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOME_CAROUSEL,
  resolveHomeCarouselSlides,
} from '@/lib/intranet/home-carousel'

describe('resolveHomeCarouselSlides', () => {
  it('usa defaults quando não há banner com imagem', () => {
    const slides = resolveHomeCarouselSlides([
      { id: '1', title: 'Sem foto', image_url: null },
      { id: '2', title: 'Vazio', image_url: '  ' },
    ])
    expect(slides).toEqual([...DEFAULT_HOME_CAROUSEL])
  })

  it('prioriza banners com image_url', () => {
    const slides = resolveHomeCarouselSlides([
      { id: '1', title: 'Campanha', image_url: '/intranet/carousel/rom-concept-tray-wide.jpg', href: '/empresa' },
      { id: '2', title: 'Sem foto', image_url: null },
    ])
    expect(slides).toEqual([
      {
        src: '/intranet/carousel/rom-concept-tray-wide.jpg',
        alt: 'Campanha',
        href: '/empresa',
        objectPosition: 'center',
      },
    ])
  })
})
