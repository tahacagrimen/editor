import { isShareLinkRevoked } from './share-link-store'
import {
  type ShareTokenError,
  type ShareTokenPayload,
  type ShareTokenResult,
  verifyShareToken,
} from './share-token'

export type ShareAccessError = ShareTokenError | 'revoked' | 'revocation_unavailable'
export type ShareAccessResult =
  | { ok: true; payload: ShareTokenPayload }
  | { ok: false; error: ShareAccessError }

export async function verifyShareAccess(
  token: string,
  options: {
    tokenOptions?: Parameters<typeof verifyShareToken>[1]
    revoked?: (token: string) => Promise<boolean>
  } = {},
): Promise<ShareAccessResult> {
  const verified: ShareTokenResult = verifyShareToken(token, options.tokenOptions)
  if (!verified.ok) return verified

  try {
    if (await (options.revoked ?? isShareLinkRevoked)(token)) {
      return { ok: false, error: 'revoked' }
    }
  } catch {
    return { ok: false, error: 'revocation_unavailable' }
  }
  return verified
}
