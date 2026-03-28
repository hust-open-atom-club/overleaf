import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'
import { getJSON, postJSON } from '@/infrastructure/fetch-json'
import useAsync from '@/shared/hooks/use-async'
import { debugConsole } from '@/utils/debugging'
import OLButton from '@/shared/components/ol/ol-button'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import Notification from '@/shared/components/notification'
import GithubLogo from '@/shared/svgs/github-logo'
import useInstanceFeatures from '@modules/instance-features/frontend/js/use-instance-features'

const GitHubSyncWidgetInner = function GitHubSyncWidget() {
  const { t } = useTranslation()
  const { appName } = getMeta('ol-ExposedSettings')

  const {
    isLoading: isCheckingConn,
    isError: isErrorConnCheck,
    runAsync: runAsyncConnCheck,
    data: isConnected,
    setData: setConnState,
  } = useAsync<boolean>()

  const {
    isLoading: isUnlinking,
    isError: isErrorUnlink,
    runAsync: runAsyncUnlink,
  } = useAsync<void>()

  const [showUnlinkModal, setShowUnlinkModal] = useState(false)

  const handleConnCheck = useCallback(() => {
    runAsyncConnCheck(getJSON('/user/github-sync/status')).catch(err =>
      debugConsole.error(err?.data?.message || err?.message || err),
    )
  }, [runAsyncConnCheck])

  useEffect(() => {
    handleConnCheck()
  }, [handleConnCheck])

  const handleUnlink = useCallback(() => {
    runAsyncUnlink(postJSON('/user/github-sync/unlink'))
      .then(() => setConnState(false))
      .catch(err => debugConsole.error(err?.data?.message || err?.message || err))
      .finally(() => setShowUnlinkModal(false))
  }, [runAsyncUnlink])

  if (isCheckingConn) {
    return (
      <div className="settings-widget-container settings-widget-container-inline-title">
        <div className="description-container small">
          <div className="title-row">
            <span className="settings-widget-inline-icon" aria-hidden="true">
              <GithubLogo />
            </span>
            <h4>GitHub</h4>
          </div>
          <div className="settings-widget-inline-body">
            <p className="small">
              <span>{t('loading')}…</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="settings-widget-container settings-widget-container-inline-title">
        <div className="description-container small">
          <div className="title-row">
            <span className="settings-widget-inline-icon" aria-hidden="true">
              <GithubLogo size={40} />
            </span>
            <h4 id="github-sync">GitHub</h4>
          </div>
          <div className="settings-widget-inline-body">
            <p className="small">
              {t('github_sync_description', { appName })}
            </p>

            {isErrorConnCheck && (
              <div className="notification-list">
                <Notification
                  type="error"
                  content={t('github_sync_error')}
                />
              </div>
            )}

            {isErrorUnlink && (
              <div className="notification-list">
                <Notification
                  type="error"
                  content={t('generic_something_went_wrong')}
                />
              </div>
            )}
          </div>
        </div>

        <div>
          {isConnected ? (
            <OLButton
              variant="danger-ghost"
              onClick={() => setShowUnlinkModal(true)}
              disabled={isUnlinking}
            >
              {isUnlinking ? t('unlinking') : t('unlink')}
            </OLButton>
          ) : isErrorConnCheck ? (
            <OLButton
              variant="secondary"
              onClick={handleConnCheck}
            >
              {t('reconnect')}
            </OLButton>
          ) : (
            <OLButton
              variant="secondary"
              href="/user/github-sync/oauth2"
            >
              {t('link')}
            </OLButton>
          )}
        </div>
      </div>

      <OLModal
        id="git-sync-modal"
        show={showUnlinkModal}
        onHide={() => setShowUnlinkModal(false)}
        backdrop="static"
      >
        <OLModalHeader>
          <OLModalTitle>
            {t('unlink_provider_account_title', {
              provider: 'GitHub',
            })}
          </OLModalTitle>
        </OLModalHeader>

        <OLModalBody>
          <p>
            {t('unlink_github_warning', {
              provider: 'GitHub',
            })}
          </p>
        </OLModalBody>

        <OLModalFooter>
          <OLButton
            variant="secondary"
            onClick={() => setShowUnlinkModal(false)}
          >
            {t('cancel')}
          </OLButton>

          <OLButton
            variant="danger-ghost"
            onClick={handleUnlink}
            disabled={isUnlinking}
          >
            {isUnlinking ? t('unlinking') : t('unlink')}
          </OLButton>
        </OLModalFooter>
      </OLModal>
    </>
  )
}

// Hide the widget entirely when GitHub Sync is disabled
export const GitHubSyncWidget = function GitHubSyncWidget() {
  const { githubSync } = useInstanceFeatures()
  if (!githubSync) {
    return null
  }
  return <GitHubSyncWidgetInner />
}
