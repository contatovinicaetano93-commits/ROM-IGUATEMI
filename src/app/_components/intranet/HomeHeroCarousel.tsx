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
      {/* Overlay mais denso — fotos claras lavavam o texto branco */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20" />
      <div
        className="relative mx-auto flex min-h-[280px] max-w-[1400px] flex-col justify-end px-5 py-8 lg:min-h-[360px] lg:px-8 lg:py-12"
        style={{ animation: 'rom-hero-in 0.7s ease-out both' }}
      >
        <div className="max-w-xl text-white">
          <h1
            className="font-serif text-3xl font-semibold leading-tight tracking-tight text-white lg:text-5xl"
            style={{ textShadow: '0 2px 16px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.8)' }}
          >
            {headline}
          </h1>
          <p
            className="mt-2 text-sm font-medium text-white lg:text-base"
            style={{ textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}
          >
            {tagline}
          </p>
          <Link
            href={active.href?.trim() || '/empresa#noticias'}
            className="mt-5 inline-flex rounded-full border border-white/80 bg-black/35 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/50"
          >
            Ver novidade
          </Link>
        </div>
        <p
          className="absolute bottom-8 right-8 hidden max-w-xs text-right font-serif text-lg font-medium text-white lg:block"
          style={{ textShadow: '0 1px 12px rgba(0,0,0,0.55)' }}
        >
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
                className={`h-2.5 w-2.5 rounded-full border border-black/30 transition ${
                  i === index ? 'bg-white shadow' : 'bg-white/55 hover:bg-white/85'
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
