package com.vibes.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MediaPlaybackService : Service() {

    private lateinit var mediaSession: MediaSession
    private val mainHandler = Handler(Looper.getMainLooper())
    private val imageExecutor = Executors.newSingleThreadExecutor()

    private var currentTitle: String = "Vibes"
    private var currentArtist: String = ""
    private var currentArtworkUrl: String = ""
    private var currentDurationSec: Double = 0.0
    private var currentPositionSec: Double = 0.0
    private var isPlaying: Boolean = false
    private var currentArtworkBitmap: Bitmap? = null

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    companion object {
        const val CHANNEL_ID = "vibes_media_playback"
        const val NOTIFICATION_ID = 1001

        const val ACTION_PLAY = "com.vibes.music.ACTION_PLAY"
        const val ACTION_PAUSE = "com.vibes.music.ACTION_PAUSE"
        const val ACTION_TOGGLE = "com.vibes.music.ACTION_TOGGLE"
        const val ACTION_NEXT = "com.vibes.music.ACTION_NEXT"
        const val ACTION_PREVIOUS = "com.vibes.music.ACTION_PREVIOUS"
        const val ACTION_SEEK = "com.vibes.music.ACTION_SEEK"
        const val ACTION_STOP = "com.vibes.music.ACTION_STOP"

        const val ACTION_UPDATE_METADATA = "com.vibes.music.ACTION_UPDATE_METADATA"
        const val ACTION_UPDATE_STATE = "com.vibes.music.ACTION_UPDATE_STATE"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_ARTIST = "extra_artist"
        const val EXTRA_ARTWORK_URL = "extra_artwork_url"
        const val EXTRA_DURATION = "extra_duration"
        const val EXTRA_IS_PLAYING = "extra_is_playing"
        const val EXTRA_POSITION = "extra_position"

        @Volatile
        var isPlayingNow: Boolean = false

        fun startOrUpdateMetadata(
            context: Context,
            title: String,
            artist: String,
            artworkUrl: String,
            durationSec: Double
        ) {
            val intent = Intent(context, MediaPlaybackService::class.java).apply {
                action = ACTION_UPDATE_METADATA
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ARTIST, artist)
                putExtra(EXTRA_ARTWORK_URL, artworkUrl)
                putExtra(EXTRA_DURATION, durationSec)
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(context, intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun updatePlaybackState(
            context: Context,
            isPlaying: Boolean,
            positionSec: Double
        ) {
            isPlayingNow = isPlaying
            val intent = Intent(context, MediaPlaybackService::class.java).apply {
                action = ACTION_UPDATE_STATE
                putExtra(EXTRA_IS_PLAYING, isPlaying)
                putExtra(EXTRA_POSITION, positionSec)
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPlaying) {
                    ContextCompat.startForegroundService(context, intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun stopNotification(context: Context) {
            isPlayingNow = false
            val intent = Intent(context, MediaPlaybackService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                context.startService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        initMediaSession()
    }

    private fun acquireLocks() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "Vibes:PlaybackWakeLock"
                ).apply {
                    setReferenceCounted(false)
                }
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(4 * 60 * 60 * 1000L) // 4 hours safe timeout
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        try {
            if (wifiLock == null) {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                @Suppress("DEPRECATION")
                wifiLock = wifiManager.createWifiLock(
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                    "Vibes:PlaybackWifiLock"
                ).apply {
                    setReferenceCounted(false)
                }
            }
            if (wifiLock?.isHeld == false) {
                wifiLock?.acquire()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun releaseLocks() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
        try {
            if (wifiLock?.isHeld == true) {
                wifiLock?.release()
            }
        } catch (_: Exception) {}
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Vibes Music Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows currently playing music and playback controls"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun initMediaSession() {
        mediaSession = MediaSession(this, "VibesMediaSession")
        mediaSession.setCallback(object : MediaSession.Callback() {
            override fun onPlay() {
                MainActivity.sendMediaCommand("play")
            }

            override fun onPause() {
                MainActivity.sendMediaCommand("pause")
            }

            override fun onSkipToNext() {
                MainActivity.sendMediaCommand("next")
            }

            override fun onSkipToPrevious() {
                MainActivity.sendMediaCommand("prev")
            }

            override fun onSeekTo(pos: Long) {
                val sec = pos / 1000.0
                currentPositionSec = sec
                updatePlaybackStateInSession()
                MainActivity.sendMediaCommand("seek", sec)
            }

            override fun onStop() {
                MainActivity.sendMediaCommand("pause")
                stopForegroundService()
            }
        })

        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        mediaSession.setSessionActivity(contentIntent)
        mediaSession.isActive = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_PLAY -> {
                MainActivity.sendMediaCommand("play")
            }
            ACTION_PAUSE -> {
                MainActivity.sendMediaCommand("pause")
            }
            ACTION_TOGGLE -> {
                MainActivity.sendMediaCommand("toggle")
            }
            ACTION_NEXT -> {
                MainActivity.sendMediaCommand("next")
            }
            ACTION_PREVIOUS -> {
                MainActivity.sendMediaCommand("prev")
            }
            ACTION_STOP -> {
                stopForegroundService()
                return START_NOT_STICKY
            }
            ACTION_UPDATE_METADATA -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: currentTitle
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: currentArtist
                val artUrl = intent.getStringExtra(EXTRA_ARTWORK_URL) ?: currentArtworkUrl
                val dur = intent.getDoubleExtra(EXTRA_DURATION, currentDurationSec)

                val artChanged = artUrl != currentArtworkUrl
                currentTitle = title
                currentArtist = artist
                currentArtworkUrl = artUrl
                currentDurationSec = dur

                if (artChanged) {
                    loadArtworkAsync(artUrl)
                } else {
                    updateMediaSessionMetadata()
                    updateNotification()
                }
            }
            ACTION_UPDATE_STATE -> {
                val playing = intent.getBooleanExtra(EXTRA_IS_PLAYING, isPlaying)
                val pos = intent.getDoubleExtra(EXTRA_POSITION, currentPositionSec)
                isPlaying = playing
                isPlayingNow = playing
                currentPositionSec = pos

                if (playing) {
                    acquireLocks()
                } else {
                    releaseLocks()
                }

                updatePlaybackStateInSession()
                updateNotification()
            }
        }

        return START_NOT_STICKY
    }

    private fun loadArtworkAsync(urlStr: String) {
        if (urlStr.isBlank()) {
            currentArtworkBitmap = null
            updateMediaSessionMetadata()
            updateNotification()
            return
        }

        imageExecutor.execute {
            var bitmap: Bitmap? = null
            var connection: HttpURLConnection? = null
            var stream: InputStream? = null
            try {
                val url = URL(urlStr)
                connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 6000
                connection.readTimeout = 6000
                connection.doInput = true
                connection.connect()
                stream = connection.inputStream

                val options = BitmapFactory.Options().apply {
                    inPreferredConfig = Bitmap.Config.RGB_565
                }
                bitmap = BitmapFactory.decodeStream(stream, null, options)
            } catch (e: Exception) {
                // Silently fallback if image failed
            } finally {
                try { stream?.close() } catch (_: Exception) {}
                try { connection?.disconnect() } catch (_: Exception) {}
            }

            mainHandler.post {
                currentArtworkBitmap = bitmap
                updateMediaSessionMetadata()
                updateNotification()
            }
        }
    }

    private fun updateMediaSessionMetadata() {
        val metaBuilder = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, (currentDurationSec * 1000).toLong())

        currentArtworkBitmap?.let {
            metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it)
            metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, it)
        }

        mediaSession.setMetadata(metaBuilder.build())
    }

    private fun updatePlaybackStateInSession() {
        val actions = PlaybackState.ACTION_PLAY or
            PlaybackState.ACTION_PAUSE or
            PlaybackState.ACTION_PLAY_PAUSE or
            PlaybackState.ACTION_SKIP_TO_NEXT or
            PlaybackState.ACTION_SKIP_TO_PREVIOUS or
            PlaybackState.ACTION_SEEK_TO or
            PlaybackState.ACTION_STOP

        val state = if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
        val speed = if (isPlaying) 1.0f else 0.0f
        val posMs = (currentPositionSec * 1000).toLong()

        val stateBuilder = PlaybackState.Builder()
            .setActions(actions)
            .setState(state, posMs, speed, SystemClock.elapsedRealtime())

        mediaSession.setPlaybackState(stateBuilder.build())
    }

    private fun buildNotification(): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Previous Action
        val prevPendingIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, MediaPlaybackService::class.java).apply { action = ACTION_PREVIOUS },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val prevAction = Notification.Action.Builder(
            Icon.createWithResource(this, R.drawable.ic_skip_previous),
            "Previous",
            prevPendingIntent
        ).build()

        // Play/Pause Action
        val playPauseIntent = Intent(this, MediaPlaybackService::class.java).apply {
            action = if (isPlaying) ACTION_PAUSE else ACTION_PLAY
        }
        val playPausePendingIntent = PendingIntent.getService(
            this,
            2,
            playPauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val playPauseIcon = if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play_arrow
        val playPauseTitle = if (isPlaying) "Pause" else "Play"
        val playPauseAction = Notification.Action.Builder(
            Icon.createWithResource(this, playPauseIcon),
            playPauseTitle,
            playPausePendingIntent
        ).build()

        // Next Action
        val nextPendingIntent = PendingIntent.getService(
            this,
            3,
            Intent(this, MediaPlaybackService::class.java).apply { action = ACTION_NEXT },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val nextAction = Notification.Action.Builder(
            Icon.createWithResource(this, R.drawable.ic_skip_next),
            "Next",
            nextPendingIntent
        ).build()

        // MediaStyle Notification
        val mediaStyle = Notification.MediaStyle()
            .setMediaSession(mediaSession.sessionToken)
            .setShowActionsInCompactView(0, 1, 2)

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        builder
            .setStyle(mediaStyle)
            .setSmallIcon(R.drawable.ic_notification_small)
            .setContentTitle(currentTitle.ifEmpty { "Vibes" })
            .setContentText(currentArtist.ifEmpty { "Playing music" })
            .setContentIntent(contentIntent)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(isPlaying)
            .addAction(prevAction)
            .addAction(playPauseAction)
            .addAction(nextAction)

        currentArtworkBitmap?.let {
            builder.setLargeIcon(it)
        }

        return builder.build()
    }

    private fun updateNotification() {
        val notification = buildNotification()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (isPlaying) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            } catch (e: Exception) {
                nm.notify(NOTIFICATION_ID, notification)
            }
        } else {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_DETACH)
                } else {
                    @Suppress("DEPRECATION")
                    stopForeground(false)
                }
            } catch (_: Exception) {}
            nm.notify(NOTIFICATION_ID, notification)
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        stopForegroundService()
    }

    private fun stopForegroundService() {
        isPlayingNow = false
        releaseLocks()
        try {
            MainActivity.sendMediaCommand("pause")
        } catch (_: Exception) {}
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (_: Exception) {}
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(NOTIFICATION_ID)
        } catch (_: Exception) {}
        if (::mediaSession.isInitialized) {
            try {
                mediaSession.isActive = false
                mediaSession.release()
            } catch (_: Exception) {}
        }
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        isPlayingNow = false
        releaseLocks()
        imageExecutor.shutdown()
        if (::mediaSession.isInitialized) {
            mediaSession.isActive = false
            mediaSession.release()
        }
    }
}
