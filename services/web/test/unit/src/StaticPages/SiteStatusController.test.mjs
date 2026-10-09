import { beforeEach, describe, expect, it, vi } from 'vitest'
import MockRequest from '../helpers/MockRequest.mjs'
import MockResponse from '../helpers/MockResponse.mjs'

const modulePath = '../../../../app/src/Features/StaticPages/SiteStatusController'

function createHealthSnapshot({
  apiOk = true,
  mongoConfigured = true,
  smokeConfigured = true,
  smokeOk = true,
  failedRunStep = null,
  completedRunSteps = [],
} = {}) {
  return {
    checkedAt: new Date(),
    skipped: false,
    api: {
      ok: apiOk,
      redis: { ok: apiOk },
      mongo: { ok: apiOk, configured: mongoConfigured },
    },
    smoke: {
      ok: smokeOk,
      configured: smokeConfigured,
      failedRunStep,
      completedRunSteps: new Set(completedRunSteps),
      missingFields: smokeConfigured
        ? []
        : [
            'SMOKE_TEST_USER',
            'SMOKE_TEST_USER_ID',
            'SMOKE_TEST_PASSWORD',
            'SMOKE_TEST_PROJECT_ID',
          ],
      stats: {
        start: new Date(),
        end: new Date(),
        duration: 0,
        steps: [],
      },
    },
  }
}

describe('SiteStatusController', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()

    ctx.settings = {
      appName: 'Overleaf',
      adminEmail: 'admin@example.com',
      siteIsOpen: true,
      editorIsOpen: true,
      shuttingDown: false,
    }
    ctx.SessionManager = {
      getSessionUser: vi.fn().mockReturnValue(null),
    }
    ctx.SystemMessageManager = {
      getMessages: vi.fn().mockReturnValue([]),
    }
    ctx.getSiteStatusHealthSnapshot = vi
      .fn()
      .mockResolvedValue(
        createHealthSnapshot({
          completedRunSteps: [
            'run.002_login',
            'run.100_loadProjectDashboard',
            'run.101_loadEditor',
          ],
        })
      )

    vi.doMock('@overleaf/settings', () => ({
      default: ctx.settings,
    }))

    vi.doMock(
      '../../../../app/src/Features/Authentication/SessionManager',
      () => ({
        default: ctx.SessionManager,
      })
    )

    vi.doMock(
      '../../../../app/src/Features/SystemMessages/SystemMessageManager',
      () => ({
        default: ctx.SystemMessageManager,
      })
    )

    vi.doMock(
      '../../../../app/src/Features/HealthCheck/HealthCheckManager',
      () => ({
        getSiteStatusHealthSnapshot: ctx.getSiteStatusHealthSnapshot,
      })
    )

    ctx.SiteStatusController = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.res = new MockResponse(vi)
    ctx.next = vi.fn()
  })

  it('renders the site status page for anonymous visitors using real health results', async function (ctx) {
    await ctx.SiteStatusController.page(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.renderedTemplate).to.equal('general/site-status')
    expect(ctx.res.renderedVariables.overallThemeOverride).to.equal('system')
    expect(ctx.res.renderedVariables.ignoreOverallThemeCookie).to.equal(
      undefined
    )
    expect(ctx.res.renderedVariables.siteStatus.overallStatus.label).to.equal(
      'All systems operational'
    )
    expect(
      ctx.res.renderedVariables.siteStatus.services.map(service => service.label)
    ).to.deep.equal(['Operational', 'Operational', 'Operational'])
    expect(ctx.next).not.toHaveBeenCalled()
  })

  it('shows health checks unavailable when smoke tests are not configured', async function (ctx) {
    ctx.getSiteStatusHealthSnapshot.mockResolvedValue(
      createHealthSnapshot({
        smokeConfigured: false,
        smokeOk: false,
        completedRunSteps: [],
      })
    )

    await ctx.SiteStatusController.page(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.renderedVariables.siteStatus.overallStatus.label).to.equal(
      'Health checks unavailable'
    )
    expect(
      ctx.res.renderedVariables.siteStatus.services.map(service => service.label)
    ).to.deep.equal([
      'Unavailable',
      'Unavailable',
      'Unavailable',
    ])
    expect(
      ctx.res.renderedVariables.siteStatus.announcements[0].title
    ).to.equal('Real health checks are not configured')
  })

  it('maps smoke test failures to the affected service cards', async function (ctx) {
    ctx.getSiteStatusHealthSnapshot.mockResolvedValue(
      createHealthSnapshot({
        smokeOk: false,
        failedRunStep: 'run.100_loadProjectDashboard',
        completedRunSteps: ['run.002_login'],
      })
    )

    await ctx.SiteStatusController.page(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.renderedVariables.siteStatus.overallStatus.label).to.equal(
      'Website unavailable'
    )
    expect(
      ctx.res.renderedVariables.siteStatus.services.map(service => service.label)
    ).to.deep.equal([
      'Unavailable',
      'Unavailable',
      'Operational',
    ])
  })

  it('prefers the saved user theme over cookies for signed-in users', async function (ctx) {
    ctx.SessionManager.getSessionUser.mockReturnValue({
      ace: {
        overallTheme: 'light-',
      },
    })

    await ctx.SiteStatusController.page(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.renderedVariables.overallThemeOverride).to.equal('light-')
    expect(ctx.res.renderedVariables.ignoreOverallThemeCookie).to.equal(true)
  })

  it('falls back to system theme for invalid saved user themes', async function (ctx) {
    ctx.SessionManager.getSessionUser.mockReturnValue({
      ace: {
        overallTheme: 'midnight',
      },
    })

    await ctx.SiteStatusController.page(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.renderedVariables.overallThemeOverride).to.equal('system')
    expect(ctx.res.renderedVariables.ignoreOverallThemeCookie).to.equal(true)
  })
})
