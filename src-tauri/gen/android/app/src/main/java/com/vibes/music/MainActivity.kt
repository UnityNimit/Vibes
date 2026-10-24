package com.vibes.music

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.lang.ref.WeakReference

class MainActivity : TauriActivity() {

    override val handleBackNavigation: Boolean = false

    companion object {
        private var activeWebView: WeakReference<WebView>? = null

        fun sendMediaCommand(action: String, arg: Double? = null) {
            val webView = activeWebView?.get() ?: return
            webView.post {
                val js = if (arg != null) {
                    "window.__onAndroidMediaAction && window.__onAndroidMediaAction('$action', $arg);"
                } else {
                    "window.__onAndroidMediaAction && window.__onAndroidMediaAction('$action');"
                }
                webView.evaluateJavascript(js, null)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideNotificationBar()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1001)
            }
        }
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        activeWebView = WeakReference(webView)
        webView.settings.apply {
            mediaPlaybackRequiresUserGesture = false
            domStorageEnabled = true
            databaseEnabled = true
        }
        webView.addJavascriptInterface(AndroidMediaInterface(this), "AndroidMediaNotification")
    }

    override fun onPause() {
        super.onPause()
        // If media is actively playing, keep WebView active so HTML5 Audio continues uninterrupted
        if (MediaPlaybackService.isPlayingNow) {
            activeWebView?.get()?.onResume()
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        val webView = activeWebView?.get()
        if (webView != null && webView.canGoBack()) {
            webView.goBack()
        } else {
            // Move task to background without killing activity or stopping audio
            moveTaskToBack(true)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (!MediaPlaybackService.isPlayingNow) {
            MediaPlaybackService.stopNotification(this)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideNotificationBar()
        }
    }

    private fun hideNotificationBar() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.statusBars())

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        @Suppress("DEPRECATION")
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
    }

    class AndroidMediaInterface(private val context: Context) {
        @JavascriptInterface
        fun updateMetadata(title: String, artist: String, artworkUrl: String, durationSec: Double) {
            MediaPlaybackService.startOrUpdateMetadata(context, title, artist, artworkUrl, durationSec)
        }

        @JavascriptInterface
        fun updatePlaybackState(isPlaying: Boolean, positionSec: Double) {
            MediaPlaybackService.updatePlaybackState(context, isPlaying, positionSec)
        }

        @JavascriptInterface
        fun stopNotification() {
            MediaPlaybackService.stopNotification(context)
        }
    }
}
