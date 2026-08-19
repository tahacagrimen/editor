import { createShareToken, verifyShareToken } from './apps/editor/lib/share-token.ts'

const env = { PASCAL_SHARE_LINK_SECRET: 'testsecret' }
const token = createShareToken('test-scene', { env })
console.log('Token:', token)

const verified = verifyShareToken(token!.token, { env })
console.log('Verified:', verified)
