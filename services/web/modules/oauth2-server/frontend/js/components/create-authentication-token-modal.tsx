import React, { memo } from 'react'

import { Modal } from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'

import { CopyToClipboard } from '@/shared/components/copy-to-clipboard'

type Props = {
    handleHide: () => void
    accessToken: string
}

function ModalDeleteAuthenticationToken({ handleHide, accessToken }: Props) {
    const { t } = useTranslation()
    
    return (
        <>
            <Modal.Header closeButton>
                <Modal.Title>{t('git_authentication_token')}</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <p>{t('git_authentication_token_create_modal_info_1')}</p>

                <p className="text-centered">
                    <div className="git-bridge-copy">
                        <code>{accessToken}</code>
                        <span>
                            <CopyToClipboard content={accessToken} 
                                kind="text" />
                        </span>
                    </div>
                </p>
                <p>
                    <Trans 
                        i18nKey="git_authentication_token_create_modal_info_2"
                        components={[
                            <strong />,
                            <a
                                href="/learn/how-to/Git_integration_authentication_tokens"
                                target="_blank"
                                rel="noopener noreferrer"
                            />,
                        ]}
                    />
                </p>
            </Modal.Body>

            <OLModalFooter>
                <OLButton
                    onClick={handleHide}
                    variant="secondary"
                >
                    {t('close')}
                </OLButton>
            </OLModalFooter>
        </>
    )
}

type DeleteAuthenticationTokenModalProps = {
    show: boolean
    handleHide: () => void
    accessToken: string
}

function DeleteAuthenticationTokenModal({ show, handleHide, accessToken }: DeleteAuthenticationTokenModalProps) {
    return (
        <OLModal
            show={show}
            animation
            onHide={handleHide}
            id="delete-authentication-token-modal"
            className="create-authentication-token-modal"
            backdrop="static"
        >
            <ModalDeleteAuthenticationToken handleHide={handleHide} accessToken={accessToken} />
        </OLModal>
    )
}

export default memo(DeleteAuthenticationTokenModal)
