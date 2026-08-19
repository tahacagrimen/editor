import { createShareToken } from "./apps/editor/lib/share-token.ts";
console.log(createShareToken('demo', { allowComments: true, ttlSeconds: 0 })?.token);
