import { useCallback } from 'react'
import _ from 'lodash'
import { saveUserSettings } from '../utils/api'
import { UserSettings } from '../../../../../types/user-settings'
import { useUserSettingsContext } from '@/shared/context/user-settings-context'
import { getAvailableOverallThemes } from '@/shared/utils/overall-themes'

export default function useSetOverallTheme() {
  const { userSettings, setUserSettings } = useUserSettingsContext()
  const { overallTheme } = userSettings

  const setOverallTheme = useCallback(
    (overallTheme: UserSettings['overallTheme']) => {
      setUserSettings(settings => ({ ...settings, overallTheme }))
    },
    [setUserSettings]
  )

  return useCallback(
    (newOverallTheme: UserSettings['overallTheme']) => {
      if (overallTheme !== newOverallTheme) {
        const chosenTheme = _.find(
          getAvailableOverallThemes(),
          theme => theme.val === newOverallTheme
        )

        if (chosenTheme) {
          setOverallTheme(newOverallTheme)
          saveUserSettings('overallTheme', newOverallTheme)
        }
      }
    },
    [overallTheme, setOverallTheme]
  )
}
