package com.vibes.music

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.lang.ref.WeakReference

class MainActivity : TauriActivity() {

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
        setupPermanentStatusBar()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                        this,
                        arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                        1001
                    )
                }
            }
        } catch (t: Throwable) {
            android.util.Log.w("MainActivity", "permission error", t)
        }
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        activeWebView = WeakReference(webView)
        try {
            webView.settings.apply {
                mediaPlaybackRequiresUserGesture = false
                domStorageEnabled = true
                databaseEnabled = true
            }
            webView.addJavascriptInterface(AndroidMediaInterface(this), "AndroidMediaNotification")
        } catch (t: Throwable) {
            android.util.Log.w("MainActivity", "onWebViewCreate settings error", t)
        }
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
            setupPermanentStatusBar()
        }
    }

    private fun setupPermanentStatusBar() {
        try {
            window.decorView.post {
                try {
                    // Ensure window content is positioned immediately below the notification bar
                    WindowCompat.setDecorFitsSystemWindows(window, true)

                    // Permanently show the notification / status bar
                    val controller = WindowCompat.getInsetsController(window, window.decorView)
                    controller?.show(WindowInsetsCompat.Type.statusBars())

                    // Clear fullscreen flag if present
                    @Suppress("DEPRECATION")
                    window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)

                    // Solid black notification bar matching the app theme
                    window.statusBarColor = Color.BLACK

                    // Light (white) text and icons on the dark notification bar
                    controller?.isAppearanceLightStatusBars = false

                    // Solid black navigation bar matching the app theme
                    window.navigationBarColor = Color.BLACK
                    controller?.isAppearanceLightNavigationBars = false
                } catch (t: Throwable) {
                    android.util.Log.w("MainActivity", "setupPermanentStatusBar post error", t)
                }
            }
        } catch (t: Throwable) {
            android.util.Log.w("MainActivity", "setupPermanentStatusBar error", t)
        }
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
