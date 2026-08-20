import type { QuantityUnit } from '@pascal-app/core/quantities'

export const SHARE_FORMAT_LOCALE = 'tr-TR'

const numberFormatters = new Map<string, Intl.NumberFormat>()
const dateFormatters = new Map<string, Intl.DateTimeFormat>()

export function formatShareNumber(
  value: number,
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
): string {
  const key = JSON.stringify(options)
  let formatter = numberFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(SHARE_FORMAT_LOCALE, options)
    numberFormatters.set(key, formatter)
  }
  return formatter.format(value)
}

export function formatShareQuantity(value: number, unit: QuantityUnit): string {
  if (unit === 'count') return formatShareNumber(value, { maximumFractionDigits: 0 })
  const suffix = unit === 'length' ? ' m' : unit === 'area' ? ' m²' : ' m³'
  return `${formatShareNumber(value)}${suffix}`
}

export function formatShareMoney(value: number, currency: string): string {
  try {
    return formatShareNumber(value, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  } catch {
    return `${formatShareNumber(value)} ${currency}`
  }
}

export function formatShareDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
): string | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const key = JSON.stringify(options)
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(SHARE_FORMAT_LOCALE, options)
    dateFormatters.set(key, formatter)
  }
  return formatter.format(date)
}
