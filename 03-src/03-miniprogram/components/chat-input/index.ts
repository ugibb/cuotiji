const recorderManager = wx.getRecorderManager()

const SILENCE_TIMEOUT_MS = 60000   // 60s 安全兜底（无真实 VAD，用户松手才是正常结束路径）
const STT_TIMEOUT_MS     = 60000   // 60s STT 超时兜底（与服务端 reqTimeout 对齐）
const CANCEL_THRESHOLD   = 60      // 上移超过 60px 触发取消

interface ChatInputData {
  inputVal:        string
  inputCursor:     number
  inputSelStart:   number
  inputSelEnd:     number
  textareaVisible: boolean
  voiceMode:       boolean
  recording:       boolean
  recognizing:     boolean
  panelVisible:    boolean
  cancelHint:      boolean
  plusExpanded:    boolean
  inputFocus:      boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Component<ChatInputData, any, any>({
  properties: {
    placeholder:    { type: String,  value: '发消息或按住说...' },
    showCamera:     { type: Boolean, value: true },
    showPlus:       { type: Boolean, value: true },
    safeBottom:     { type: Number,  value: 0 },
    showTopBorder:  { type: Boolean, value: true },
    voiceDoneSignal: { type: Number, value: 0 },
  },

  observers: {
    voiceDoneSignal(val: number) {
      if (val > 0 && this.data.recognizing) {
        this._clearSttTimer()
        this.setData({ recording: false, recognizing: false, panelVisible: false, voiceMode: false, cancelHint: false })
      }
    },
  },

  data: {
    inputVal:        '',
    inputCursor:     -1,
    inputSelStart:   -1,
    inputSelEnd:     -1,
    textareaVisible: true,
    voiceMode:       false,
    recording:       false,
    recognizing:     false,
    panelVisible:    false,
    cancelHint:      false,
    plusExpanded:    false,
    inputFocus:      false,
  },

  lifetimes: {
    attached() {
      ;(this as any)._isAttached = true

      recorderManager.onStop((res: WechatMiniprogram.OnStopListenerResult) => {
        if (!(this as any)._isAttached) return
        this._clearSilenceTimer()
        if ((this as any)._cancelled) {
          ;(this as any)._cancelled = false
          this.setData({ recording: false, recognizing: false, panelVisible: false, voiceMode: false })
          return
        }
        // recognizing 已在 onVoiceTouchEnd / onInputAreaTouchEnd 里提前设为 true
        // 这里只补发事件，不重复 setData
        this._startSttTimer()
        this.triggerEvent('voiceEnd', { filePath: res.tempFilePath })
      })

      recorderManager.onError((err: { errMsg?: string }) => {
        if (!(this as any)._isAttached) return
        this._clearSilenceTimer()
        this._clearSttTimer()
        ;(this as any)._cancelled = false
        this.setData({ recording: false, recognizing: false, panelVisible: false, voiceMode: false })
        const isDenied = err?.errMsg?.includes('auth deny') || err?.errMsg?.includes('authorize')
        if (isDenied) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '请在设置中开启麦克风权限，才能使用语音功能',
            confirmText: '去设置',
            success: (res) => { if (res.confirm) wx.openSetting() },
          })
        } else {
          wx.showToast({ title: '录音失败，请重试', icon: 'none' })
        }
      })
    },
    detached() {
      ;(this as any)._isAttached = false
      this._clearSilenceTimer()
      this._clearSttTimer()
      // 页面销毁时若仍在录音，标记取消并停止，避免回调打扰后续页面
      if (this.data.recording) {
        ;(this as any)._cancelled = true
        recorderManager.stop()
      }
    },
  },

  methods: {
    // ── 文字输入 ──────────────────────────────────
    onInput(e: WechatMiniprogram.Input) {
      this.setData({ inputVal: e.detail.value })
    },

    onInputFocus() {
      // focus 触发后立即重置，保证下次 fillText 能再次触发
      this.setData({ inputFocus: false })
    },

    onSendText() {
      const text = this.data.inputVal.trim()
      if (!text) return
      this.triggerEvent('send', { type: 'text', content: text })
      this.setData({ inputVal: '' })
    },

    // ── 长按「按住说话」开始录音 ──────────────────
    onVoiceTouchStart(e: WechatMiniprogram.TouchEvent) {
      if (this.data.recording || this.data.recognizing) return
      ;(this as any)._touchStartY = e.touches[0].clientY
      ;(this as any)._cancelled   = false
      this.setData({ voiceMode: true, panelVisible: true, recording: true, cancelHint: false })
      recorderManager.start({ format: 'mp3', sampleRate: 16000, duration: 120000 })
      this._startSilenceTimer()
    },

    onVoiceTouchMove(e: WechatMiniprogram.TouchEvent) {
      if (!this.data.recording) return
      const moveUp = (this as any)._touchStartY - e.touches[0].clientY
      this.setData({ cancelHint: moveUp > CANCEL_THRESHOLD })
    },

    // ★ 关键修复：松手立刻进入「识别中」，不等 mp3 编码完成 ★
    onVoiceTouchEnd() {
      if (!this.data.recording) return
      if (this.data.cancelHint) {
        this._doCancel()
      } else {
        this.setData({ recording: false, recognizing: true, cancelHint: false })
        recorderManager.stop()
      }
    },

    onVoiceTouchCancel() {
      if (this.data.recording) this._doCancel()
    },

    _doCancel() {
      ;(this as any)._cancelled = true
      this._clearSilenceTimer()
      if (this.data.recording) {
        this.setData({ recording: false })
        recorderManager.stop()
      }
      this.setData({ recognizing: false, panelVisible: false, voiceMode: false, cancelHint: false })
    },

    // ── 输入框区域长按直接触发录音（无需先切换语音模式）──
    onInputAreaTouchStart(e: WechatMiniprogram.TouchEvent) {
      if (this.data.recording || this.data.recognizing || this.data.voiceMode) return
      ;(this as any)._inputStartY   = e.touches[0].clientY
      ;(this as any)._inputLpActive = false
      ;(this as any)._inputLpTimer  = setTimeout(() => {
        ;(this as any)._inputLpActive = true
        ;(this as any)._touchStartY   = (this as any)._inputStartY
        ;(this as any)._cancelled     = false
        this.setData({ voiceMode: true, panelVisible: true, recording: true, cancelHint: false })
        recorderManager.start({ format: 'mp3', sampleRate: 16000, duration: 120000 })
        this._startSilenceTimer()
      }, 400)
    },

    onInputAreaTouchEnd() {
      clearTimeout((this as any)._inputLpTimer)
      if (!(this as any)._inputLpActive) return
      ;(this as any)._inputLpActive = false
      this.onVoiceTouchEnd()
    },

    onInputAreaTouchCancel() {
      clearTimeout((this as any)._inputLpTimer)
      if ((this as any)._inputLpActive) {
        ;(this as any)._inputLpActive = false
        this.onVoiceTouchCancel()
      }
    },

    // ── 供父页面调用 ─────────────────────────────
    fillText(text: string) {
      this._clearSttTimer()
      const trimmed = text.trim()
      const end = trimmed.length
      // 1. 销毁 textarea（textareaVisible:false + wx:if），写入目标 cursor/selection
      //    此时无 active touch，销毁安全；hidden 继续负责录音期间的 touch 链保护
      this.setData({
        recognizing: false, panelVisible: false, voiceMode: false, cancelHint: false,
        inputVal: trimmed, inputCursor: end, inputSelStart: end, inputSelEnd: end,
        inputFocus: false, textareaVisible: false,
      }, () => {
        wx.nextTick(() => {
          // 2. 重建 textarea（首次挂载），cursor/selection-start/end 作为初始值生效
          this.setData({ textareaVisible: true }, () => {
            wx.nextTick(() => {
              // 3. 首次 focus：cursor 定位末行
              this.setData({ inputFocus: true })
            })
          })
        })
      })
    },

    dismissVoicePanel() {
      this._clearSttTimer()
      this.setData({ recording: false, recognizing: false, panelVisible: false, voiceMode: false, cancelHint: false })
    },

    resetVoice(errorMsg?: string) {
      this._clearSttTimer()
      this.setData({ recording: false, recognizing: false, panelVisible: false, voiceMode: false, cancelHint: false })
      wx.showToast({ title: errorMsg || '识别失败，请重试', icon: 'none' })
    },

    // ── 语音/键盘切换 ─────────────────────────────
    onToggleVoiceMode() {
      if (this.data.recording || this.data.recognizing) return
      this.setData({ voiceMode: !this.data.voiceMode, panelVisible: false })
    },

    // ── 静音自动停止 ──────────────────────────────
    _startSilenceTimer() {
      this._clearSilenceTimer()
      ;(this as any)._silenceTimer = setTimeout(() => {
        if (this.data.recording) {
          this.setData({ recording: false, recognizing: true })
          recorderManager.stop()
        }
      }, SILENCE_TIMEOUT_MS)
    },

    _clearSilenceTimer() {
      if ((this as any)._silenceTimer) {
        clearTimeout((this as any)._silenceTimer)
        ;(this as any)._silenceTimer = null
      }
    },

    _startSttTimer() {
      this._clearSttTimer()
      ;(this as any)._sttTimer = setTimeout(() => {
        if (this.data.recognizing) this.resetVoice('识别超时，请重试')
      }, STT_TIMEOUT_MS)
    },

    _clearSttTimer() {
      if ((this as any)._sttTimer) {
        clearTimeout((this as any)._sttTimer)
        ;(this as any)._sttTimer = null
      }
    },

    onCamera() { this.triggerEvent('camera', {}) },

    onPlus() { this.setData({ plusExpanded: !this.data.plusExpanded }) },

    onMenuCamera() {
      this.setData({ plusExpanded: false })
      this.triggerEvent('camera', {})
    },
    onMenuAlbum() {
      this.setData({ plusExpanded: false })
      this.triggerEvent('album', {})
    },
    onMenuFile() {
      this.setData({ plusExpanded: false })
      this.triggerEvent('file', {})
    },
  },
})
