import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ShareLocation } from '@/lib/share-location'
import { ShareLocationPanel } from './share-location-panel'

const location: ShareLocation = {
  points: [
    [0, 0],
    [20, 0],
    [16, 14],
    [0, 10],
  ],
  badge: 'TKGM · Ada 214 / Parsel 7',
  rows: [
    { label: 'Address', value: 'Fikirtepe Mah. 214 Ada 7 Parsel' },
    { label: 'Coordinate', value: '40,9944 · 29,0472' },
  ],
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=40.9944%2C29.0472',
  warning: 'Land registry reference data — not a surveyed site plan.',
  edited: false,
}

test('the share map draws the stored outline and a working external map link', () => {
  const markup = renderToStaticMarkup(<ShareLocationPanel location={location} />)

  expect(markup).toContain('points="0,0 20,0 16,14 0,10"')
  expect(markup).toContain('TKGM · Ada 214 / Parsel 7')
  expect(markup).toContain('40,9944 · 29,0472')
  expect(markup).toContain('https://www.google.com/maps/search/?api=1&amp;query=40.9944%2C29.0472')
  expect(markup).toContain('Haritada aç')
  expect(markup).toContain('TKGM referans verisi — aplikasyon krokisi değildir.')
})
