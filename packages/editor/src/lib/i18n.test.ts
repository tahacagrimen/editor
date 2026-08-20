import { describe, expect, test } from 'bun:test'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { translate, translateReactNode } from './i18n-core'

describe('translate', () => {
  test('uses Turkish by default when explicitly selected', () => {
    expect(translate('Settings', 'tr')).toBe('Ayarlar')
    expect(translate('  Saved scenes  ', 'tr')).toBe('  Kayıtlı sahneler  ')
  })

  test('keeps English source text unchanged', () => {
    expect(translate('Settings', 'en')).toBe('Settings')
  })

  test('uses the binding read-only label on share links', () => {
    expect(translate('Read only', 'tr')).toBe('Salt okunur')
  })

  test('uses the binding summary labels on share links', () => {
    expect(translate('Total construction', 'tr')).toBe('Toplam inşaat')
    expect(translate('Footprint area', 'tr')).toBe('Taban alanı')
    expect(translate('Land area', 'tr')).toBe('Yüzölçümü')
    expect(translate('Zoning check', 'tr')).toBe('İmar kontrolü')
    expect(translate('Exceeded', 'tr')).toBe('Aşıldı')
    expect(translate('Suitable', 'tr')).toBe('Uygun')
  })

  test('uses the binding read-only quantity copy on share links', () => {
    expect(translate('Quantity', 'tr')).toBe('Miktar')
    expect(translate('Takeoff item', 'tr')).toBe('Kalem')
    expect(translate('Amount', 'tr')).toBe('Tutar')
    expect(translate('live quantities', 'tr')).toBe('canlı metraj')
    expect(translate('Ground level', 'tr')).toBe('Zemin Kat')
    expect(translate('Show costs', 'tr')).toBe('Maliyetleri göster')
    expect(
      translate(
        'Quantities belong to the selected level and exclude hidden items. Wall face area is gross — openings are not subtracted. Unit prices are estimates, not quotations.',
        'tr',
      ),
    ).toBe(
      'Miktarlar seçili kata aittir, gizli öğeler hariçtir. Duvar yüzey alanı brüttür — boşluklar düşülmemiştir. Birim fiyatlar tahminidir, teklif değildir.',
    )
  })

  test('uses the binding parcel-location copy on share links', () => {
    expect(translate('Open in maps', 'tr')).toBe('Haritada aç')
    expect(translate('North angle', 'tr')).toBe('Kuzey açısı')
    expect(translate('TKGM parcel query', 'tr')).toBe('TKGM parsel sorgu')
  })

  test('translates dynamic editor labels', () => {
    expect(translate('Level 3', 'tr')).toBe('Kat 3')
    expect(translate('Measure: Distance', 'tr')).toBe('Ölç: Mesafe')
    expect(translate('Snapping: Grid', 'tr')).toBe('Yakalama: Izgara')
    expect(translate('4 objects selected', 'tr')).toBe('4 nesne seçildi')
    expect(translate('Wall is available in Expert mode.', 'tr')).toBe(
      'Duvar yalnızca Uzman modunda kullanılabilir.',
    )
    expect(translate('Image will scale 1.25x from the first point.', 'tr')).toBe(
      'Görsel ilk noktaya göre 1.25 kat ölçeklenecek.',
    )
  })

  test('translates auto-generated node names without stealing the storey names', () => {
    expect(translate('Wall 12', 'tr')).toBe('Duvar 12')
    expect(translate('Slab 3', 'tr')).toBe('Döşeme 3')
    expect(translate('Base Cabinet 7', 'tr')).toBe('Alt Dolap 7')
    // The storey rules run first: "Floor 2" is a level, not a numbered slab.
    expect(translate('Floor 2', 'tr')).toBe('2. Kat')
    expect(translate('Basement 1', 'tr')).toBe('1. Bodrum Kat')
    // A name the user typed has no entry to match and stays as typed.
    expect(translate('Kuzey blok 4', 'tr')).toBe('Kuzey blok 4')
  })

  test('translates visibility toggles composed from an already-translated title', () => {
    expect(translate('Show grid', 'tr')).toBe('Izgara göster')
    expect(translate('Hide skirting', 'tr')).toBe('Süpürgelik gizle')
    // The section title reaches the label localised, so the noun is Turkish
    // before the verb is appended.
    expect(translate('Show süpürgelik', 'tr')).toBe('süpürgelik göster')
    // The comment toggle keeps its own count-carrying wording.
    expect(translate('Show resolved (3)', 'tr')).toBe('Çözülenleri göster (3)')
  })
})

describe('translateReactNode', () => {
  test('adds stable keys to translated static siblings while preserving existing keys', () => {
    const tree = createElement(
      'svg',
      null,
      createElement('path', { key: 'north' }),
      createElement('path'),
    )

    const translated = translateReactNode(tree, 'tr')
    expect(isValidElement<{ children: ReactNode }>(translated)).toBe(true)

    const children = (translated as ReactElement<{ children: ReactNode }>).props.children
    expect(Array.isArray(children)).toBe(true)
    expect((children as ReactElement[]).map((child) => child.key)).toEqual(['north', 'localized-1'])
  })

  test('keeps a single child as one element for asChild primitives', () => {
    const tree = createElement('button', null, createElement('span', null, 'Settings'))

    const translated = translateReactNode(tree, 'tr')
    const child = (translated as ReactElement<{ children: ReactNode }>).props.children

    expect(Array.isArray(child)).toBe(false)
    expect(isValidElement<{ children: ReactNode }>(child)).toBe(true)
    expect((child as ReactElement<{ children: ReactNode }>).props.children).toBe('Ayarlar')
  })

  test('translates semantic string props used by composed editor controls', () => {
    const tree = createElement('section', {
      description: 'Choose how the application interface looks.',
      heading: 'Wall Mode',
      label: 'Settings',
    })

    const translated = translateReactNode(tree, 'tr') as ReactElement<{
      description: string
      heading: string
      label: string
    }>

    expect(translated.props).toMatchObject({
      description: 'Uygulama arayüzünün görünümünü seçin.',
      heading: 'Duvar Modu',
      label: 'Ayarlar',
    })
  })

  test('translates mixed dynamic UI fragments without changing their values', () => {
    const tree = createElement('p', null, 'Calibrated:', ' ', 12, ' m read as ', 3, ' m.')

    const translated = translateReactNode(tree, 'tr') as ReactElement<{ children: ReactNode[] }>
    expect(translated.props.children).toEqual(['Kalibre edildi:', ' ', 12, ' m yerine ', 3, ' m.'])
  })
})
