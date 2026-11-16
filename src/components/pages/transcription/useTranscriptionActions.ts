import {useI18n} from 'vue-i18n';
import {Notice} from 'obsidian';

import {usePlugin} from '../../../composables/usePlugin';
import {openObsidianNote} from '../../../services/noteNavigation';

/** Notice-on-failure wrappers shared by the transcription views. */
export function useTranscriptionActions() {
  const plugin = usePlugin();
  const {t} = useI18n();
  const state = plugin.transcription.state;

  const runAction = async <T>(action: () => Promise<T>) => {
    try {
      return await action();
    } catch (error: any) {
      new Notice(error?.message || t('transcription.actionFailed'));
      return undefined;
    }
  };

  const openNotePath = (path: string) =>
    runAction(() =>
      openObsidianNote(plugin.app, path, {
        moved: t('transcription.targetMissing'),
        openFailed: t('transcription.openTargetNoteFailed'),
      }),
    );

  const openCurrentRecord = () =>
    runAction(() =>
      plugin.api.openTranscriptions(state.completedDetail?.record.id || state.record?.id),
    );

  return {runAction, openNotePath, openCurrentRecord};
}
