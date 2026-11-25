/**
 * dsh-restart-menu — browser half.
 *
 * Renders a "重启" button directly beside the Windows caption menu (应用 / 编辑).
 * The caption menubar lives in the desktop preload's *open* shadow root, so the
 * page can append a third button that inherits the native styling. Clicking it
 * calls the host route `POST /plugins/dsh-restart-menu/restart`, which stops the
 * desktop app and starts it again from a detached helper process.
 *
 * The bundle is hand written on purpose: the client half needs no React and no
 * bundler, it only touches the DOM. The module system still requires the
 * `__ModuleLoader__.load({ id, factory })` envelope.
 */
window.__ModuleLoader__.load({
  id: 'dsh-restart-menu',
  factory: (require) => {
    const module = { exports: {} }

    const PLUGIN_ID = 'dsh-restart-menu'
    const ROUTE = `/plugins/${PLUGIN_ID}/restart`
    const HOST_SELECTOR = '[data-windows-menu]'
    const MARKER = 'data-dsh-restart-menu'
    const MOUNT_INTERVAL_MS = 600
    const MOUNT_TIMEOUT_MS = 5 * 60 * 1000
    const RESET_AFTER_MS = 15000

    /** Chinese UI when the document is Chinese, English otherwise. */
    function isChinese() {
      const lang = (document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase()
      return lang.startsWith('zh')
    }

    function strings() {
      const zh = isChinese()
      return zh
        ? {
            label: '重启',
            title: '重启 DeepSeek Harness：关闭当前应用并自动重新启动',
            restarting: '重启中…',
            restartingTitle: '正在重启 DeepSeek Harness，窗口会在几秒内关闭并重新打开',
            failed: '重启失败',
            failedTitle: '无法触发重启',
            stalled: '重启未生效',
            stalledTitle: '已请求重启，但应用仍在运行；请查看日志'
          }
        : {
            label: 'Restart',
            title: 'Restart DeepSeek Harness: close the app and launch it again',
            restarting: 'Restarting…',
            restartingTitle: 'DeepSeek Harness is restarting; the window closes and reopens shortly',
            failed: 'Restart failed',
            failedTitle: 'Could not trigger the restart',
            stalled: 'No restart',
            stalledTitle: 'Restart requested but the app is still running; check the log'
          }
    }

    function reset(button, delay) {
      window.setTimeout(() => {
        const text = strings()
        button.dataset.busy = '0'
        button.removeAttribute('aria-busy')
        button.textContent = text.label
        button.title = text.title
      }, delay)
    }

    /** Ask the host to restart the whole desktop app. */
    async function restart(button) {
      if (button.dataset.busy === '1') return
      const text = strings()
      button.dataset.busy = '1'
      button.setAttribute('aria-busy', 'true')
      button.textContent = text.restarting
      button.title = text.restartingTitle

      // If the process survives this window, the helper failed; say so instead
      // of leaving a permanent "重启中…".
      window.setTimeout(() => {
        if (button.dataset.busy !== '1') return
        button.textContent = text.stalled
        button.title = text.stalledTitle
        reset(button, 4000)
      }, RESET_AFTER_MS)

      try {
        const response = await fetch(ROUTE, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'content-type': 'application/json',
            'x-dsh-restart-menu': '1'
          },
          body: '{}'
        })
        if (!response.ok) {
          let detail = ''
          try {
            detail = (await response.text()).slice(0, 200)
          } catch {
            detail = ''
          }
          throw new Error(`HTTP ${response.status}${detail ? ` ${detail}` : ''}`)
        }
      } catch (error) {
        console.warn('[dsh-restart-menu] restart failed', error)
        button.dataset.busy = '0'
        button.removeAttribute('aria-busy')
        button.textContent = text.failed
        button.title = `${text.failedTitle}: ${String((error && error.message) || error)}`
        reset(button, 5000)
      }
    }

    /** Append the button once the desktop menubar exists. */
    function mount() {
      const host = document.querySelector(HOST_SELECTOR)
      const root = host && host.shadowRoot
      if (!root) return false
      const bar = root.querySelector('[role="menubar"]')
      if (!bar) return false
      if (bar.querySelector('[' + MARKER + ']') !== null) return true

      const text = strings()
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.setAttribute(MARKER, '')
      button.textContent = text.label
      button.title = text.title
      button.style.marginInlineStart = '4px'
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
      })
      button.addEventListener('click', () => {
        void restart(button)
      })
      bar.append(button)
      console.info('[dsh-restart-menu] restart button mounted')
      return true
    }

    function apply(ctx) {
      if (typeof location === 'undefined' || location.protocol !== 'dsh-app:') return

      const startedAt = Date.now()
      let timer = 0
      let mounted = false
      const stop = () => {
        if (timer !== 0) {
          window.clearInterval(timer)
          timer = 0
        }
      }
      const tick = () => {
        if (mounted) {
          stop()
          return
        }
        try {
          if (mount()) {
            mounted = true
            stop()
            return
          }
        } catch (error) {
          console.warn('[dsh-restart-menu] mount probe failed', error)
        }
        if (Date.now() - startedAt > MOUNT_TIMEOUT_MS) stop()
      }
      tick()
      if (!mounted) timer = window.setInterval(tick, MOUNT_INTERVAL_MS)

      if (ctx && typeof ctx.effect === 'function') {
        ctx.effect(() => stop, 'dsh-restart-menu: titlebar button')
      }
    }

    module.exports = { name: 'restart-menu', apply }
    return module.exports
  }
})
