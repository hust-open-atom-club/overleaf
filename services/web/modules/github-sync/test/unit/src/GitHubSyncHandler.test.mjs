import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/GitHubSyncHandler.mjs'
)
const errorsPath = path.join(
  import.meta.dirname,
  '../../../app/src/GitSyncErrors.mjs'
)

const PROJECT_ID = '6502f1a1c3e4b5d6e7f80901'
const OWNER_ID = '6502f1a1c3e4b5d6e7f80902'
const COLLABORATOR_ID = '6502f1a1c3e4b5d6e7f80903'

describe('GitHubSyncHandler', function () {
  beforeEach(async function (ctx) {
    ctx.storedState = {
      mergeStatus: 'clean',
      repoFullName: 'octocat/thesis',
      defaultBranchName: 'master',
      unmergedBranchName: null,
    }
    ctx.SyncStateManager = {
      getProjectState: vi.fn(async () =>
        ctx.storedState ? { ...ctx.storedState } : null
      ),
      createProjectState: vi.fn(),
      updateProjectState: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      removeProjectState: vi.fn(),
    }
    ctx.TokenManager = { getUserToken: vi.fn().mockResolvedValue('gh-token') }
    ctx.api = {
      maxConcurrency: 5,
      getRepoInfo: vi.fn().mockResolvedValue({
        fullName: 'octocat/thesis',
        defaultBranchName: 'master',
        canPush: true,
      }),
      getPushPermission: vi.fn(),
    }
    ctx.ProjectGetter = {
      promises: {
        getProject: vi.fn().mockResolvedValue({ owner_ref: OWNER_ID }),
      },
    }
    ctx.UserGetter = {
      promises: {
        getUserEmail: vi.fn().mockResolvedValue('owner@example.com'),
      },
    }

    vi.doMock('@overleaf/settings', () => ({ default: {} }))
    vi.doMock(
      '../../../../../app/src/Features/Project/ProjectGetter.mjs',
      () => ({ default: ctx.ProjectGetter })
    )
    vi.doMock(
      '../../../../../app/src/Features/Uploads/ProjectUploadManager.mjs',
      () => ({ default: {} })
    )
    vi.doMock('../../../../../app/src/Features/User/UserGetter.mjs', () => ({
      default: ctx.UserGetter,
    }))
    vi.doMock(
      '../../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs',
      () => ({ default: {} })
    )
    vi.doMock('../../../../../app/src/infrastructure/FileWriter.mjs', () => ({
      SizeLimitedStream: class {},
    }))
    vi.doMock('../../../app/src/GitHubApiClient.mjs', () => ({
      default: ctx.api,
    }))
    vi.doMock('../../../app/src/SyncStateManager.mjs', () => ({
      default: ctx.SyncStateManager,
    }))
    vi.doMock('../../../app/src/HistoryManager.mjs', () => ({ default: {} }))
    vi.doMock('../../../app/src/TokenManager.mjs', () => ({
      default: ctx.TokenManager,
    }))

    ctx.GitHubSyncHandler = (await import(modulePath)).default
    // loaded after the handler so that `instanceof` sees the same classes
    ctx.Errors = await import(errorsPath)
  })

  describe('getProjectState', function () {
    it('returns need-export without asking GitHub when the project is not linked', async function (ctx) {
      ctx.storedState = null

      const state = await ctx.GitHubSyncHandler.getProjectState(
        OWNER_ID,
        PROJECT_ID
      )

      expect(state).toEqual({ mergeStatus: 'need-export' })
      expect(ctx.api.getRepoInfo).not.toHaveBeenCalled()
      expect(ctx.SyncStateManager.updateProjectState).not.toHaveBeenCalled()
    })

    it('keeps the stored values when the repository is unchanged', async function (ctx) {
      const state = await ctx.GitHubSyncHandler.getProjectState(
        OWNER_ID,
        PROJECT_ID
      )

      expect(ctx.api.getRepoInfo).toHaveBeenCalledWith(
        'gh-token',
        'octocat/thesis'
      )
      expect(ctx.SyncStateManager.updateProjectState).not.toHaveBeenCalled()
      expect(state).toEqual({
        mergeStatus: 'clean',
        repoFullName: 'octocat/thesis',
        unmergedBranchName: null,
      })
    })

    describe('when the repository was renamed or transferred', function () {
      beforeEach(function (ctx) {
        ctx.api.getRepoInfo.mockResolvedValue({
          fullName: 'new-org/thesis-2026',
          defaultBranchName: 'master',
          canPush: true,
        })
      })

      it('stores the new full name', async function (ctx) {
        await ctx.GitHubSyncHandler.getProjectState(OWNER_ID, PROJECT_ID)

        expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledTimes(1)
        expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledWith(
          PROJECT_ID,
          { repoFullName: 'new-org/thesis-2026' }
        )
      })

      it('returns the new full name to the panel', async function (ctx) {
        const state = await ctx.GitHubSyncHandler.getProjectState(
          OWNER_ID,
          PROJECT_ID
        )

        expect(state).toEqual({
          mergeStatus: 'clean',
          repoFullName: 'new-org/thesis-2026',
          unmergedBranchName: null,
        })
      })

      it('still refreshes for a user who can see the repository but cannot push', async function (ctx) {
        ctx.api.getRepoInfo.mockResolvedValue({
          fullName: 'new-org/thesis-2026',
          defaultBranchName: 'master',
          canPush: false,
        })

        const state = await ctx.GitHubSyncHandler.getProjectState(
          COLLABORATOR_ID,
          PROJECT_ID
        )

        expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledWith(
          PROJECT_ID,
          { repoFullName: 'new-org/thesis-2026' }
        )
        expect(state).toEqual({
          mergeStatus: 'need-permission',
          repoFullName: 'new-org/thesis-2026',
          unmergedBranchName: null,
          ownerEmail: 'owner@example.com',
        })
      })

      it('serves the stored name when saving the new one fails', async function (ctx) {
        ctx.SyncStateManager.updateProjectState.mockRejectedValue(
          new Error('mongo is down')
        )

        const state = await ctx.GitHubSyncHandler.getProjectState(
          OWNER_ID,
          PROJECT_ID
        )

        expect(state).toEqual({
          mergeStatus: 'clean',
          repoFullName: 'octocat/thesis',
          unmergedBranchName: null,
        })
      })
    })

    describe('when the default branch changed', function () {
      beforeEach(function (ctx) {
        ctx.api.getRepoInfo.mockResolvedValue({
          fullName: 'octocat/thesis',
          defaultBranchName: 'main',
          canPush: true,
        })
      })

      it('stores the new default branch', async function (ctx) {
        await ctx.GitHubSyncHandler.getProjectState(OWNER_ID, PROJECT_ID)

        expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledTimes(1)
        expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledWith(
          PROJECT_ID,
          { defaultBranchName: 'main' }
        )
      })

      it('does not change the shape of the answer', async function (ctx) {
        const state = await ctx.GitHubSyncHandler.getProjectState(
          OWNER_ID,
          PROJECT_ID
        )

        expect(state).toEqual({
          mergeStatus: 'clean',
          repoFullName: 'octocat/thesis',
          unmergedBranchName: null,
        })
      })

      it('fills in a default branch that was never stored', async function (ctx) {
        ctx.storedState.defaultBranchName = null

        await ctx.GitHubSyncHandler.getProjectState(OWNER_ID, PROJECT_ID)

        expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledWith(
          PROJECT_ID,
          { defaultBranchName: 'main' }
        )
      })
    })

    it('stores a rename and a new default branch in one update', async function (ctx) {
      ctx.api.getRepoInfo.mockResolvedValue({
        fullName: 'new-org/thesis-2026',
        defaultBranchName: 'main',
        canPush: true,
      })

      await ctx.GitHubSyncHandler.getProjectState(OWNER_ID, PROJECT_ID)

      expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledTimes(1)
      expect(ctx.SyncStateManager.updateProjectState).toHaveBeenCalledWith(
        PROJECT_ID,
        { repoFullName: 'new-org/thesis-2026', defaultBranchName: 'main' }
      )
    })

    for (const [label, errorName] of [
      ['missing', 'NotFoundError'],
      ['inaccessible', 'PermissionDeniedError'],
    ]) {
      describe(`when the repository is ${label}`, function () {
        beforeEach(function (ctx) {
          ctx.api.getRepoInfo.mockRejectedValue(
            new ctx.Errors[errorName]('GitHub said no', { status: 404 })
          )
        })

        it('keeps the sync record', async function (ctx) {
          await ctx.GitHubSyncHandler.getProjectState(OWNER_ID, PROJECT_ID)

          expect(ctx.SyncStateManager.removeProjectState).not.toHaveBeenCalled()
          expect(ctx.SyncStateManager.updateProjectState).not.toHaveBeenCalled()
        })

        it('tells the owner that the repository needs attention', async function (ctx) {
          const state = await ctx.GitHubSyncHandler.getProjectState(
            OWNER_ID,
            PROJECT_ID
          )

          expect(state).toEqual({
            mergeStatus: 'need-permission',
            repoFullName: 'octocat/thesis',
            unmergedBranchName: null,
          })
        })

        it("gives a collaborator the owner's email address", async function (ctx) {
          const state = await ctx.GitHubSyncHandler.getProjectState(
            COLLABORATOR_ID,
            PROJECT_ID
          )

          expect(state).toEqual({
            mergeStatus: 'need-permission',
            repoFullName: 'octocat/thesis',
            unmergedBranchName: null,
            ownerEmail: 'owner@example.com',
          })
        })
      })
    }

    it('passes other GitHub errors on without touching the sync record', async function (ctx) {
      ctx.api.getRepoInfo.mockRejectedValue(
        new ctx.Errors.InvalidTokenError('Invalid token', { status: 401 })
      )

      await expect(
        ctx.GitHubSyncHandler.getProjectState(OWNER_ID, PROJECT_ID)
      ).to.be.rejectedWith(ctx.Errors.InvalidTokenError)

      expect(ctx.SyncStateManager.removeProjectState).not.toHaveBeenCalled()
      expect(ctx.SyncStateManager.updateProjectState).not.toHaveBeenCalled()
    })
  })
})
