<script setup lang="ts">
  import {computed} from 'vue';

  import {clearChatDraft, panelState} from '../../services/panelStore';
  import ChatPage from '../pages/ChatPage.vue';

  const chatActive = computed(() => panelState.overlay === null && panelState.tab === 'ask');

  const history = computed(() =>
    panelState.history?.type === 'chat' ? panelState.history : {id: '', token: 0},
  );
</script>

<template>
  <div class="wm2-assistant wm2-ask-tab">
    <Transition name="wm2-view" appear>
      <div class="wm-tab-content wm-chat-tab-content">
        <ChatPage
          :active="chatActive"
          :history-item-id="history.id"
          :history-token="history.token"
          :draft-message="panelState.chatDraft.message"
          :draft-token="panelState.chatDraft.token"
          :draft-auto-send="panelState.chatDraft.autoSend"
          :draft-new-session="panelState.chatDraft.newSession"
          @draft-consumed="clearChatDraft"
        />
      </div>
    </Transition>
  </div>
</template>
