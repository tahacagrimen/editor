import { createHash } from 'node:crypto'

export type ManagedShareLink = {
  id: string
  role: 'viewer' | 'editor'
  createdBy: { id: string; name: string | null } | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export function shareTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function recordShareLink(input: {
  token: string
  sceneId: string
  createdBy: string | null
  expiresAt: Date | null
}): Promise<string | null> {
  if (!process.env.POSTGRES_URL) return null

  const [{ getDatabase }, { shareLinks }] = await Promise.all([
    import('@pascal-app/db'),
    import('@pascal-app/db/schema'),
  ])
  const [created] = await getDatabase()
    .insert(shareLinks)
    .values({
      sceneId: input.sceneId,
      tokenHash: shareTokenHash(input.token),
      role: 'viewer',
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
    })
    .returning({ id: shareLinks.id })
  if (!created) throw new Error('share_link_record_failed')
  return created.id
}

export async function isShareLinkRevoked(token: string): Promise<boolean> {
  if (!process.env.POSTGRES_URL) return false

  const [{ getDatabase }, { shareLinks }, { eq }] = await Promise.all([
    import('@pascal-app/db'),
    import('@pascal-app/db/schema'),
    import('drizzle-orm'),
  ])
  const row = await getDatabase().query.shareLinks.findFirst({
    columns: { revokedAt: true },
    where: eq(shareLinks.tokenHash, shareTokenHash(token)),
  })
  return row?.revokedAt !== null && row?.revokedAt !== undefined
}

export async function listManagedShareLinks(sceneId: string): Promise<ManagedShareLink[]> {
  if (!process.env.POSTGRES_URL) return []

  const [{ getDatabase }, { shareLinks, users }, { desc, eq }] = await Promise.all([
    import('@pascal-app/db'),
    import('@pascal-app/db/schema'),
    import('drizzle-orm'),
  ])
  const rows = await getDatabase()
    .select({
      id: shareLinks.id,
      role: shareLinks.role,
      createdById: shareLinks.createdBy,
      createdByName: users.name,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .leftJoin(users, eq(shareLinks.createdBy, users.id))
    .where(eq(shareLinks.sceneId, sceneId))
    .orderBy(desc(shareLinks.createdAt))

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    createdBy: row.createdById
      ? { id: row.createdById, name: row.createdByName?.trim() || null }
      : null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function revokeManagedShareLink(sceneId: string, linkId: string): Promise<boolean> {
  if (!process.env.POSTGRES_URL) return false

  const [{ getDatabase }, { shareLinks }, { and, eq }] = await Promise.all([
    import('@pascal-app/db'),
    import('@pascal-app/db/schema'),
    import('drizzle-orm'),
  ])
  const [revoked] = await getDatabase()
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.sceneId, sceneId)))
    .returning({ id: shareLinks.id })
  return Boolean(revoked)
}
