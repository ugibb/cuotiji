// TODO: 联调时将 MOCK_UPLOAD 改为 false
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assignmentsApi, uploadApi } from '../../../services/api'

// const MOCK_UPLOAD = true
const MOCK_UPLOAD = false

function mockDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface CameraPageData {
  statusBarHeight: number
  chapterId: number | null
  chapterName: string
  planDate: string
  mode: 'full' | 'single'
  imageUrl: string
  uploading: boolean
  uploadProgress: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<CameraPageData, any>({
  data: {
    statusBarHeight: 0,
    chapterId: null,
    chapterName: '',
    planDate: '',
    mode: 'full',
    imageUrl: '',
    uploading: false,
    uploadProgress: 0
  },

  onLoad(options: Record<string, string | undefined>) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 44,
      chapterId: Number(options?.chapterId || 0),
      chapterName: decodeURIComponent(options?.chapterName || ''),
      planDate: options?.date || ''
    })
  },

  onClose() {
    wx.navigateBack({ delta: 1 })
  },

  onHelp() {
    wx.showModal({
      title: '拍照贴士',
      content: '1. 将整张试卷平铺在光线充足处\n2. 保持手机平稳，避免模糊\n3. 确保题目文字清晰可见\n4. 避免阴影遮挡题目',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  onModeSwitch(e: WechatMiniprogram.CustomEvent) {
    const mode = e.currentTarget.dataset.mode as 'full' | 'single'
    this.setData({ mode })
  },

  onChooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const file = res.tempFiles[0]
        this.setData({ imageUrl: file.tempFilePath })
      },
      fail: (err) => {
        console.error('chooseMedia album failed:', err)
      }
    })
  },

  onCapture() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      camera: 'back',
      success: (res) => {
        const file = res.tempFiles[0]
        this.setData({ imageUrl: file.tempFilePath })
      },
      fail: (err) => {
        console.error('chooseMedia camera failed:', err)
      }
    })
  },

  onRetake() {
    this.setData({ imageUrl: '' })
  },

  async uploadToStorage(filePath: string): Promise<string> {
    const presignRes = await uploadApi.presign(`assignment-${Date.now()}.jpg`)
    if (!presignRes.success || !presignRes.data) {
      throw new Error('获取上传地址失败')
    }

    const { uploadUrl, fileUrl } = presignRes.data

    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: uploadUrl,
        filePath,
        name: 'file',
        success: () => resolve(fileUrl),
        fail: reject
      })
    })
  },

  async onUpload() {
    const { imageUrl, chapterId, planDate } = this.data
    if (!imageUrl) {
      wx.showToast({ title: '请先拍照', icon: 'none' })
      return
    }

    this.setData({ uploading: true, uploadProgress: 10 })

    try {
      if (MOCK_UPLOAD) {
        await mockDelay(600)
        this.setData({ uploadProgress: 40 })
        await mockDelay(400)
        this.setData({ uploadProgress: 70 })
        await mockDelay(300)
        this.setData({ uploadProgress: 100 })
        await mockDelay(200)
        wx.redirectTo({ url: `/pages/checkin/loading/index?assignmentId=9999&chapterName=${encodeURIComponent(this.data.chapterName)}` })
        return
      }

      const storedUrl = await this.uploadToStorage(imageUrl)
      this.setData({ uploadProgress: 50 })

      const app = getApp<{ globalData: { currentStudent: { id: number } | null } }>()
      const studentId = app.globalData.currentStudent?.id || 0

      const res = await assignmentsApi.create({
        chapterId: chapterId!,
        planDate,
        imageUrl: storedUrl,
        studentId
      })

      this.setData({ uploadProgress: 80 })

      if (res.success && res.data) {
        wx.redirectTo({
          url: `/pages/checkin/loading/index?assignmentId=${res.data.assignmentId}&chapterName=${encodeURIComponent(this.data.chapterName)}`
        })
      } else {
        throw new Error(res.error || '提交失败')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败，请重试'
      wx.showToast({ title: msg, icon: 'error' })
    } finally {
      this.setData({ uploading: false, uploadProgress: 0 })
    }
  }
})
