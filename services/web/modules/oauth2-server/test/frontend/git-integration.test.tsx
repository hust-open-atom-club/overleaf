import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import { render, screen } from '@testing-library/react'
import GitIntegrationSetting from '../../frontend/js/components/git-integration'

describe('<GitIntegrationSetting />', function () {
  beforeEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  after(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('renders the created-at date from the API response', async function () {
    fetchMock.get('/oauth/personal-access-tokens', [
      {
        _id: 'token-1',
        accessTokenPartial: 'olp_TPEX',
        createdAt: '2025-03-29T00:00:00.000Z',
        lastUsedAt: '2025-03-28T00:00:00.000Z',
        accessTokenExpiresAt: '2026-03-28T00:00:00.000Z',
      },
    ])

    render(<GitIntegrationSetting />)

    await screen.findByText('29th Mar 2025')
    screen.getByText('28th Mar 2025')
    screen.getByText('28th Mar 2026')
  })
})
