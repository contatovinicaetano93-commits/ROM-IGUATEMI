'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { HomeCarouselSlide } from '@/lib/intranet/home-carousel'

const INTERVAL_MS = 2_000

export function HomeHeroCarousel({
  slides,
  headline,
  tagline,
  quote,
}: {
  slides: readonly HomeCarouselSlide[]
  headline: string
  tagline: string
  quote: string
}) {
  const safeSlides = slides.length > 0 ? slides : [{ src: '/intranet/hero.jpg', alt: 'ROM Club' }]
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (safeSlides.length < 2 || paused) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % safeSlides.length)
    }, INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [safeSlides.length, paused])

  const active = safeSlides[index] ?? safeSlides[0]

  return (
    <section
      className="relative isolate min-h-[280px] overflow-hidden lg:min-h-[360px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carrossel"
    >
      {safeSlides.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${slide.src}-${i}`}
          src={slide.src}
          alt={i === index ? slide.alt : ''}
          aria-hidden={i !== index}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ objectPosition: slide.objectPosition ?? 'center' }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-black/25" />
      <div
        className="relative mx-auto flex min-h-[280px] max-w-[1400px] flex-col justify-end px-5 py-8 lg:min-h-[360px] lg:px-8 lg:py-12"
        style={{ animation: 'rom-hero-in 0.7s ease-out both' }}
      >
        <div className="max-w-xl text-white">
          <h1 className="font-serif text-3xl leading-tight lg:text-5xl">{headline}</h1>
          <p className="mt-2 text-sm text-white/80 lg:text-base">{tagline}</p>
          <Link
            href={active.href?.trim() || '/empresa#noticias'}
            className="mt-5 inline-flex rounded-full border border-white/40 px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            Ver novidade
          </Link>
        </div>
        <p className="absolute bottom-8 right-8 hidden max-w-xs text-right font-serif text-lg text-white/80 lg:block">
          “{quote}”
        </p>
        {safeSlides.length > 1 ? (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 lg:bottom-6">
            {safeSlides.map((slide, i) => (
              <button
                key={`dot-${slide.src}-${i}`}
                type="button"
                aria-label={`Slide ${i + 1}`}
                aria-current={i === index}
                className={`h-2 w-2 rounded-full transition ${
                  i === index ? 'bg-white' : 'bg-white/40 hover:bg-white/70'
                }`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
