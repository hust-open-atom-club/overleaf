import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertOne = vi.fn()
const findOne = vi.fn()
const createSecret = vi.fn()

vi.mock('../../../../app/src/infrastructure/mongodb.mjs', () => ({
  db: {
    oauthAccessTokens: {
      insertOne,
    },
  },
}))

vi.mock('../../../app/src/SecretsHelper.mjs', () => ({
  default: {
    createSecret,
  },
}))

vi.mock('../../../../app/src/models/OauthApplication.mjs', () => ({
  OauthApplication: {
    findOne,
  },
}))

describe('OAuthPersonalAccessTokenManager', function () {
  beforeEach(function () {
    insertOne.mockReset()
    findOne.mockReset()
    createSecret.mockReset()
    createSecret.mockReturnValue('abcdefghijklmnopqrstuvwxzy1234567890')
    findOne.mockReturnValue({
      lean: () => ({
        exec: () => Promise.resolve({ _id: 'git-bridge-app-id' }),
      }),
    })
  })

  it('stores createdAt separately from the expiry date', async function () {
    const { default: OAuthPersonalAccessTokenManager } = await import(
      '../../../app/src/OAuthPersonalAccessTokenManager.mjs'
    )

    const accessToken = await OAuthPersonalAccessTokenManager.createToken(
      'user-123'
    )

    expect(accessToken).toBe('olp_abcdefghijklmnopqrstuvwxzy1234567890')
    expect(insertOne).toHaveBeenCalledTimes(1)

    const accessTokenDoc = insertOne.mock.calls[0][0]
    expect(accessTokenDoc.createdAt).toBeInstanceOf(Date)
    expect(accessTokenDoc.accessTokenExpiresAt).toBeInstanceOf(Date)
    expect(accessTokenDoc.accessTokenExpiresAt.getTime()).toBeGreaterThan(
      accessTokenDoc.createdAt.getTime()
    )
    expect(accessTokenDoc.accessTokenExpiresAt.getUTCFullYear()).toBe(
      accessTokenDoc.createdAt.getUTCFullYear() + 1
    )
    expect(accessTokenDoc.accessTokenExpiresAt.getUTCMonth()).toBe(
      accessTokenDoc.createdAt.getUTCMonth()
    )
    expect(accessTokenDoc.accessTokenExpiresAt.getUTCDate()).toBe(
      accessTokenDoc.createdAt.getUTCDate()
    )
  })
})
