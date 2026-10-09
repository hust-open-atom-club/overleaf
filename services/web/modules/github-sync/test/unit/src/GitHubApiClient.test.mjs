import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/GitHubApiClient.mjs'
)
const errorsPath = path.join(
  import.meta.dirname,
  '../../../app/src/GitSyncErrors.mjs'
)

describe('GitHubApiClient', function () {
  beforeEach(async function (ctx) {
    ctx.fetchJson = vi.fn()
    ctx.RequestFailedError = class RequestFailedError extends Error {
      constructor(status, headers = {}) {
        super('request failed')
        this.response = { status, headers: new Headers(headers) }
      }
    }

    vi.doMock('@overleaf/settings', () => ({ default: {} }))
    vi.doMock('@overleaf/fetch-utils', () => ({
      fetchJson: ctx.fetchJson,
      fetchJsonWithResponse: vi.fn(),
      fetchStreamWithResponse: vi.fn(),
      fetchNothing: vi.fn(),
      fetchStream: vi.fn(),
      RequestFailedError: ctx.RequestFailedError,
    }))

    ctx.api = (await import(modulePath)).default
    // loaded after the client so that `instanceof` sees the same classes
    ctx.Errors = await import(errorsPath)
  })

  describe('getRepoInfo', function () {
    it('asks GitHub for the repository with the user token', async function (ctx) {
      ctx.fetchJson.mockResolvedValue({
        full_name: 'octocat/thesis',
        default_branch: 'master',
        permissions: { push: true },
      })

      await ctx.api.getRepoInfo('gh-token', 'octocat/thesis')

      expect(ctx.fetchJson).toHaveBeenCalledTimes(1)
      const [url, options] = ctx.fetchJson.mock.calls[0]
      expect(url).toBe('https://api.github.com/repos/octocat/thesis')
      expect(options.headers.Authorization).toBe('Bearer gh-token')
    })

    it('returns the current name and default branch, which differ after a rename', async function (ctx) {
      // GitHub answers a request for the old name with the repository's new data
      ctx.fetchJson.mockResolvedValue({
        full_name: 'new-org/thesis-2026',
        default_branch: 'main',
        permissions: { admin: false, push: true, pull: true },
      })

      const info = await ctx.api.getRepoInfo('gh-token', 'octocat/thesis')

      expect(info).toEqual({
        fullName: 'new-org/thesis-2026',
        defaultBranchName: 'main',
        canPush: true,
      })
    })

    it('reports no push permission when GitHub does not grant it', async function (ctx) {
      ctx.fetchJson.mockResolvedValue({
        full_name: 'octocat/thesis',
        default_branch: 'master',
      })

      const info = await ctx.api.getRepoInfo('gh-token', 'octocat/thesis')

      expect(info.canPush).toBe(false)
    })

    it('rejects with NotFoundError when the repository is missing', async function (ctx) {
      ctx.fetchJson.mockRejectedValue(new ctx.RequestFailedError(404))

      await expect(
        ctx.api.getRepoInfo('gh-token', 'octocat/thesis')
      ).to.be.rejectedWith(ctx.Errors.NotFoundError)
    })

    it('rejects with PermissionDeniedError when the repository is inaccessible', async function (ctx) {
      ctx.fetchJson.mockRejectedValue(new ctx.RequestFailedError(403))

      await expect(
        ctx.api.getRepoInfo('gh-token', 'octocat/thesis')
      ).to.be.rejectedWith(ctx.Errors.PermissionDeniedError)
    })
  })

  describe('getPushPermission', function () {
    it('still answers with a boolean', async function (ctx) {
      ctx.fetchJson.mockResolvedValue({
        full_name: 'octocat/thesis',
        default_branch: 'master',
        permissions: { push: true },
      })
      expect(await ctx.api.getPushPermission('gh-token', 'octocat/thesis')).toBe(
        true
      )

      ctx.fetchJson.mockResolvedValue({
        full_name: 'octocat/thesis',
        default_branch: 'master',
        permissions: { push: false },
      })
      expect(await ctx.api.getPushPermission('gh-token', 'octocat/thesis')).toBe(
        false
      )
    })
  })
})
