package com.callguard.ai;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.NoiseSuppressor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AlphaAnimation;
import android.view.animation.Animation;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Timer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Call Guard AI - Real-time Call Scam Detection
 * Complete MainActivity for Sketchware Pro
 * 
 * Pipeline:
 * 1. Record 7-second audio chunk (PCM 16bit, 16kHz mono)
 * 2. Convert to WAV format
 * 3. POST to STT API -> Get transcript text
 * 4. GET to Llama API with context -> Get JSON with score
 * 5. Parse score from JSON and display in floating window
 */
public class MainActivity extends Activity {

    private static final String TAG = "CallGuardAI";
    
    // Permission request codes
    private static final int PERMISSION_REQUEST_CODE = 100;
    private static final int OVERLAY_PERMISSION_CODE = 101;
    private static final int PICK_AUDIO_REQUEST = 9001;
    
    // Audio recording settings - PCM 16bit, 16kHz mono
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int CHUNK_DURATION_MS = 7000; // 7 seconds
    private static final int AUDIO_SOURCE = MediaRecorder.AudioSource.VOICE_COMMUNICATION;
    
    // API Endpoints
    private static final String STT_API_URL = "https://stt.apkadadyy.workers.dev/";
    private static final String LLAMA_API_URL = "https://llama.apkadadyy.workers.dev/?q=";
    
    // Telegram Bot API for testing audio capture
    private static final String TELEGRAM_BOT_TOKEN = "YOUR_BOT_TOKEN_HERE"; // Replace with your bot token
    private static final String TELEGRAM_CHAT_ID = "YOUR_CHAT_ID_HERE"; // Replace with your chat/channel ID
    
    // Notification
    private static final String CHANNEL_ID = "callguard_service";
    
    // UI Components
    private LinearLayout mainLayout;
    private TextView statusText;
    private TextView lastCallInfo;
    private TextView debugText;
    private LinearLayout permissionCard;
    private LinearLayout statusCard;
    private ProgressBar loadingBar;
    
    // Telephony
    private TelephonyManager telephonyManager;
    private PhoneStateListener phoneStateListener;
    private boolean isCallActive = false;
    private String currentPhoneNumber = "";
    
    // Audio Recording
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private Thread recordingThread;
    private int bufferSize;
    private AutomaticGainControl agc;
    private NoiseSuppressor noiseSuppressor;
    private static final int SILENCE_THRESHOLD = 500; // threshold for silence detection (RMS)
    
    // Floating Window
    private WindowManager windowManager;
    
    // STT Response Window (Top)
    private LinearLayout floatingViewStt;
    private TextView floatingTranscriptText;
    private View floatingIndicatorStt;
    
    // Llama Response Window (Bottom)
    private LinearLayout floatingView;
    private TextView floatingStatusText;
    private TextView floatingScoreText;
    private View floatingIndicator;
    
    private boolean isFloatingWindowShowing = false;
    
    // Threading
    private Handler mainHandler;
    private ExecutorService executorService;
    private Timer chunkTimer;
    
    // State
    private boolean allPermissionsGranted = false;
    private double currentScore = 0.0;
    private String lastTranscript = "";
    private String lastApiResponse = "";
    private List<CallRecord> callHistory = new ArrayList<>();
    
    // UI State - Screen navigation
    private static final int SCREEN_SPLASH = 0;
    private static final int SCREEN_ONBOARDING = 1;
    private static final int SCREEN_DASHBOARD = 2;
    private int currentScreen = SCREEN_SPLASH;
    private int currentTab = 0; // 0=Home, 1=Analysis, 2=Dashboard, 3=About, 4=Settings
    private android.widget.FrameLayout rootLayout;
    private LinearLayout dashboardContainer;
    
    // Database
    private SharedPreferences preferences;
    // Debug: saved wav counter
    private AtomicInteger savedChunkCounter = new AtomicInteger(0);
    // Toggle for text/message analysis
    private boolean messageAnalysisEnabled = false;
    // Runtime-configurable endpoints and tokens (persisted in SharedPreferences)
    private String sttApiUrl;
    private String llamaApiUrl;
    private String telegramToken;
    private String telegramChatIdLocal;
    private int silenceThresholdRuntime;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Log.d(TAG, "=== Call Guard AI Starting ===");
        
        // Initialize
        mainHandler = new Handler(Looper.getMainLooper());
        executorService = Executors.newFixedThreadPool(3);
        preferences = getSharedPreferences("CallGuardAI", MODE_PRIVATE);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        // Load persisted settings (endpoints, tokens, thresholds)
        loadSettings();
        
        // Create notification channel
        createNotificationChannel();
        
        // Create root layout that will hold all screens
        rootLayout = new android.widget.FrameLayout(this);
        rootLayout.setBackgroundColor(Color.parseColor("#0f172a"));
        setContentView(rootLayout);
        
        // Load history
        loadCallHistory();
        
        // Show splash screen first
        showScreen(SCREEN_SPLASH);
        
        // Transition to onboarding after 2.5 seconds
        mainHandler.postDelayed(() -> showScreen(SCREEN_ONBOARDING), 2500);
    }
    
    private void setupMainUI() {
        // Main container
        mainLayout = new LinearLayout(this);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        mainLayout.setBackgroundColor(Color.parseColor("#F8FAFC"));
        mainLayout.setPadding(dp(24), dp(48), dp(24), dp(24));
        
        // App Header
        LinearLayout headerLayout = new LinearLayout(this);
        headerLayout.setOrientation(LinearLayout.VERTICAL);
        headerLayout.setGravity(Gravity.CENTER);
        headerLayout.setPadding(0, dp(20), 0, dp(30));
        
        // Shield Icon
        TextView shieldIcon = new TextView(this);
        shieldIcon.setText("\uD83D\uDEE1\uFE0F");
        shieldIcon.setTextSize(64);
        shieldIcon.setGravity(Gravity.CENTER);
        headerLayout.addView(shieldIcon);
        
        // App Title
        TextView titleText = new TextView(this);
        titleText.setText("Call Guard AI");
        titleText.setTextSize(28);
        titleText.setTextColor(Color.parseColor("#1E40AF"));
        titleText.setTypeface(null, android.graphics.Typeface.BOLD);
        titleText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.setMargins(0, dp(12), 0, dp(4));
        titleText.setLayoutParams(titleParams);
        headerLayout.addView(titleText);
        
        // Subtitle
        TextView subtitleText = new TextView(this);
        subtitleText.setText("Real-time Scam Protection");
        subtitleText.setTextSize(16);
        subtitleText.setTextColor(Color.parseColor("#64748B"));
        subtitleText.setGravity(Gravity.CENTER);
        headerLayout.addView(subtitleText);
        
        mainLayout.addView(headerLayout);
        
        // Status Card
        statusCard = createCard();
        
        TextView statusLabel = new TextView(this);
        statusLabel.setText("Protection Status");
        statusLabel.setTextSize(14);
        statusLabel.setTextColor(Color.parseColor("#64748B"));
        statusCard.addView(statusLabel);
        
        statusText = new TextView(this);
        statusText.setText("Checking permissions...");
        statusText.setTextSize(20);
        statusText.setTextColor(Color.parseColor("#94A3B8"));
        statusText.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        statusParams.setMargins(0, dp(8), 0, 0);
        statusText.setLayoutParams(statusParams);
        statusCard.addView(statusText);
        
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.setMargins(0, 0, 0, dp(16));
        statusCard.setLayoutParams(cardParams);
        mainLayout.addView(statusCard);
        
        // Permission Card
        permissionCard = createCard();
        permissionCard.setVisibility(View.GONE);
        
        TextView permTitle = new TextView(this);
        permTitle.setText("Permissions Required");
        permTitle.setTextSize(18);
        permTitle.setTextColor(Color.parseColor("#0F172A"));
        permTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        permissionCard.addView(permTitle);
        
        TextView permDesc = new TextView(this);
        permDesc.setText("Call Guard AI needs the following permissions to protect you:\n\n" +
            "\u2022 Phone State - Detect incoming/outgoing calls\n" +
            "\u2022 Record Audio - Analyze call audio\n" +
            "\u2022 Call Log - Show recent call history\n" +
            "\u2022 Overlay - Display protection status during calls");
        permDesc.setTextSize(14);
        permDesc.setTextColor(Color.parseColor("#64748B"));
        permDesc.setLineSpacing(dp(4), 1);
        LinearLayout.LayoutParams permDescParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        permDescParams.setMargins(0, dp(12), 0, dp(16));
        permDesc.setLayoutParams(permDescParams);
        permissionCard.addView(permDesc);
        
        // Grant Permission Button
        TextView grantButton = createButton("Grant Permissions", Color.parseColor("#1E40AF"));
        grantButton.setOnClickListener(v -> requestAllPermissions());
        permissionCard.addView(grantButton);
        
        LinearLayout.LayoutParams permCardParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        permCardParams.setMargins(0, 0, 0, dp(16));
        permissionCard.setLayoutParams(permCardParams);
        mainLayout.addView(permissionCard);
        
        // How It Works Card
        LinearLayout howItWorksCard = createCard();
        
        TextView howTitle = new TextView(this);
        howTitle.setText("How It Works");
        howTitle.setTextSize(18);
        howTitle.setTextColor(Color.parseColor("#0F172A"));
        howTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        howItWorksCard.addView(howTitle);
        
        String[] steps = {
            "1. Make or receive a phone call",
            "2. AI analyzes conversation in real-time",
            "3. Floating indicator shows threat level",
            "4. Get instant alerts for suspicious calls"
        };
        
        for (String step : steps) {
            TextView stepText = new TextView(this);
            stepText.setText(step);
            stepText.setTextSize(14);
            stepText.setTextColor(Color.parseColor("#64748B"));
            LinearLayout.LayoutParams stepParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );
            stepParams.setMargins(0, dp(8), 0, 0);
            stepText.setLayoutParams(stepParams);
            howItWorksCard.addView(stepText);
        }
        
        LinearLayout.LayoutParams howCardParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        howCardParams.setMargins(0, 0, 0, dp(16));
        howItWorksCard.setLayoutParams(howCardParams);
        mainLayout.addView(howItWorksCard);
        
        // Last Call Card
        LinearLayout lastCallCard = createCard();
        
        TextView lastCallTitle = new TextView(this);
        lastCallTitle.setText("Last Analyzed Call");
        lastCallTitle.setTextSize(18);
        lastCallTitle.setTextColor(Color.parseColor("#0F172A"));
        lastCallTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        lastCallCard.addView(lastCallTitle);
        
        lastCallInfo = new TextView(this);
        lastCallInfo.setText("No calls analyzed yet");
        lastCallInfo.setTextSize(14);
        lastCallInfo.setTextColor(Color.parseColor("#64748B"));
        LinearLayout.LayoutParams lastCallParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lastCallParams.setMargins(0, dp(8), 0, 0);
        lastCallInfo.setLayoutParams(lastCallParams);
        lastCallCard.addView(lastCallInfo);
        
        mainLayout.addView(lastCallCard);
        
        // Debug Card - for showing API responses
        LinearLayout debugCard = createCard();
        
        TextView debugTitle = new TextView(this);
        debugTitle.setText("Debug Info");
        debugTitle.setTextSize(18);
        debugTitle.setTextColor(Color.parseColor("#0F172A"));
        debugTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        debugCard.addView(debugTitle);
        
        debugText = new TextView(this);
        debugText.setText("API responses will appear here...");
        debugText.setTextSize(12);
        debugText.setTextColor(Color.parseColor("#64748B"));
        debugText.setMaxLines(10);
        LinearLayout.LayoutParams debugParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        debugParams.setMargins(0, dp(8), 0, 0);
        debugText.setLayoutParams(debugParams);
        debugCard.addView(debugText);
        
        LinearLayout.LayoutParams debugCardParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        debugCardParams.setMargins(0, dp(16), 0, 0);
        debugCard.setLayoutParams(debugCardParams);
        mainLayout.addView(debugCard);
        
        // Loading indicator
        loadingBar = new ProgressBar(this);
        loadingBar.setVisibility(View.GONE);
        LinearLayout.LayoutParams loadingParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        loadingParams.gravity = Gravity.CENTER;
        loadingParams.setMargins(0, dp(20), 0, 0);
        loadingBar.setLayoutParams(loadingParams);
        mainLayout.addView(loadingBar);
        
        // Wrap main UI in a root FrameLayout so we can add floating buttons and bottom navigation
        android.widget.FrameLayout rootLayout = new android.widget.FrameLayout(this);
        rootLayout.addView(mainLayout, new android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Bottom navigation
        LinearLayout bottomNav = new LinearLayout(this);
        bottomNav.setOrientation(LinearLayout.HORIZONTAL);
        bottomNav.setBackgroundColor(Color.parseColor("#FFFFFF"));
        bottomNav.setElevation(dp(6));
        bottomNav.setPadding(dp(8), dp(8), dp(8), dp(8));

        String[] navTitles = {"Home", "About", "Dashboard", "Settings"};
        for (String t : navTitles) {
            TextView btn = createButton(t, Color.parseColor("#111827"));
            btn.setTextSize(14);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f);
            lp.setMargins(dp(6), 0, dp(6), 0);
            btn.setLayoutParams(lp);
            bottomNav.addView(btn);

            // Attach simple behaviors
            if (t.equals("Home")) {
                btn.setOnClickListener(v -> Toast.makeText(this, "Home", Toast.LENGTH_SHORT).show());
            } else if (t.equals("About")) {
                btn.setOnClickListener(v -> {
                    String about = "Call Guard AI\n\n" +
                        "Real-time call conversation analysis for scam detection.\n\n" +
                        "Features:\n" +
                        "- Live audio analysis during calls\n" +
                        "- Transcript + risk scoring\n" +
                        "- Floating widgets for quick visibility\n\n" +
                        "Future:\n" +
                        "- Streaming STT (WebSocket)\n" +
                        "- Voice Activity Detection (VAD)\n" +
                        "- Historical dashboards & ML improvements";
                    new android.app.AlertDialog.Builder(this)
                        .setTitle("About Call Guard AI")
                        .setMessage(about)
                        .setPositiveButton("OK", null)
                        .show();
                });
            } else if (t.equals("Dashboard")) {
                btn.setOnClickListener(v -> {
                    // Quick placeholder for dashboard - show debug text
                    if (debugText != null) {
                        debugText.setText("Detailed Dashboards and Analysis\n(Coming soon - use logs for now)");
                    }
                    Toast.makeText(this, "Open Dashboard (placeholder)", Toast.LENGTH_SHORT).show();
                });
            } else if (t.equals("Settings")) {
                btn.setOnClickListener(v -> {
                    // Simple settings dialog to toggle message analysis
                    String msg = messageAnalysisEnabled ? "Message analysis is currently ENABLED" : "Message analysis is currently DISABLED";
                    new android.app.AlertDialog.Builder(this)
                        .setTitle("Settings")
                        .setMessage(msg)
                        .setPositiveButton(messageAnalysisEnabled ? "Stop Message Analysis" : "Start Message Analysis", (d, w) -> {
                            messageAnalysisEnabled = !messageAnalysisEnabled;
                            Toast.makeText(this, messageAnalysisEnabled ? "Message analysis started" : "Message analysis stopped", Toast.LENGTH_SHORT).show();
                        })
                        .setNegativeButton("Close", null)
                        .show();
                });
            }
        }

        android.widget.FrameLayout.LayoutParams navLp = new android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                dp(72),
                Gravity.BOTTOM
        );
        rootLayout.addView(bottomNav, navLp);

        // Floating Upload button
        TextView fabUpload = createButton("Upload", Color.parseColor("#0EA5A4"));
        fabUpload.setTextSize(12);
        android.widget.FrameLayout.LayoutParams fabUpLp = new android.widget.FrameLayout.LayoutParams(dp(64), dp(64), Gravity.BOTTOM | Gravity.END);
        fabUpLp.setMargins(0, 0, dp(16), dp(120));
        fabUpload.setLayoutParams(fabUpLp);
        fabUpload.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("audio/*");
            startActivityForResult(Intent.createChooser(intent, "Select audio"), PICK_AUDIO_REQUEST);
        });
        rootLayout.addView(fabUpload, fabUpLp);

        // Floating Stop button
        TextView fabStop = createButton("Stop", Color.parseColor("#EF4444"));
        fabStop.setTextSize(12);
        android.widget.FrameLayout.LayoutParams fabStopLp = new android.widget.FrameLayout.LayoutParams(dp(64), dp(64), Gravity.BOTTOM | Gravity.END);
        fabStopLp.setMargins(0, 0, dp(16), dp(32));
        fabStop.setLayoutParams(fabStopLp);
        fabStop.setOnClickListener(v -> {
            if (isRecording) {
                stopAudioRecording();
            }
            hideFloatingWindow();
            Toast.makeText(this, "Live analysis stopped", Toast.LENGTH_SHORT).show();
        });
        rootLayout.addView(fabStop, fabStopLp);

        setContentView(rootLayout);
    }
    
    private LinearLayout createCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));
        
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setCornerRadius(dp(16));
        background.setStroke(dp(1), Color.parseColor("#E2E8F0"));
        card.setBackground(background);
        
        return card;
    }
    
    private TextView createButton(String text, int backgroundColor) {
        TextView button = new TextView(this);
        button.setText(text);
        button.setTextSize(16);
        button.setTextColor(Color.WHITE);
        button.setTypeface(null, android.graphics.Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(24), dp(14), dp(24), dp(14));
        
        GradientDrawable background = new GradientDrawable();
        background.setColor(backgroundColor);
        background.setCornerRadius(dp(12));
        button.setBackground(background);
        
        return button;
    }
    
    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }
    
    // ==================== SCREEN MANAGEMENT ====================
    
    /**
     * Switch between splash, onboarding, and dashboard screens
     */
    private void showScreen(int screen) {
        currentScreen = screen;
        rootLayout.removeAllViews();
        
        switch (screen) {
            case SCREEN_SPLASH:
                createSplashScreen();
                break;
            case SCREEN_ONBOARDING:
                createOnboardingScreen();
                break;
            case SCREEN_DASHBOARD:
                createDashboardScreen();
                break;
        }
    }
    
    /**
     * Splash Screen - 2.5 second intro with logo
     */
    private void createSplashScreen() {
        LinearLayout splash = new LinearLayout(this);
        splash.setOrientation(LinearLayout.VERTICAL);
        splash.setBackgroundColor(Color.parseColor("#020617"));
        splash.setGravity(Gravity.CENTER);
        
        TextView shield = new TextView(this);
        shield.setText("\uD83D\uDEE1\uFE0F");
        shield.setTextSize(80);
        shield.setGravity(Gravity.CENTER);
        splash.addView(shield);
        
        TextView title = new TextView(this);
        title.setText("CALL GUARD AI");
        title.setTextSize(28);
        title.setTextColor(Color.parseColor("#00ffcc"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.setMargins(0, dp(20), 0, 0);
        title.setLayoutParams(titleParams);
        splash.addView(title);
        
        TextView subtitle = new TextView(this);
        subtitle.setText("Protecting You From Scam Calls");
        subtitle.setTextSize(16);
        subtitle.setTextColor(Color.parseColor("#94a3b8"));
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subParams.setMargins(0, dp(12), 0, 0);
        subtitle.setLayoutParams(subParams);
        splash.addView(subtitle);
        
        rootLayout.addView(splash, new android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }
    
    /**
     * Onboarding Screen - 4 feature slides
     */
    private void createOnboardingScreen() {
        LinearLayout onboarding = new LinearLayout(this);
        onboarding.setOrientation(LinearLayout.VERTICAL);
        onboarding.setBackgroundColor(Color.parseColor("#0f172a"));
        
        String[][] slides = {
            {"AI Call Analysis", "Analyze calls using AI fraud detection"},
            {"Audio Upload", "Upload recorded calls easily"},
            {"Live Wave Analysis", "Visual wave while analyzing"},
            {"Fraud Score", "Get instant scam probability score"}
        };
        
        android.widget.HorizontalScrollView hsv = new android.widget.HorizontalScrollView(this);
        LinearLayout slideContainer = new LinearLayout(this);
        slideContainer.setOrientation(LinearLayout.HORIZONTAL);
        
        for (String[] slide : slides) {
            LinearLayout slideView = new LinearLayout(this);
            slideView.setOrientation(LinearLayout.VERTICAL);
            slideView.setGravity(Gravity.CENTER);
            slideView.setBackgroundColor(Color.parseColor("#0f172a"));
            slideView.setLayoutParams(new LinearLayout.LayoutParams(
                getResources().getDisplayMetrics().widthPixels,
                LinearLayout.LayoutParams.MATCH_PARENT
            ));
            
            TextView slideTitle = new TextView(this);
            slideTitle.setText(slide[0]);
            slideTitle.setTextSize(24);
            slideTitle.setTextColor(Color.WHITE);
            slideTitle.setTypeface(null, android.graphics.Typeface.BOLD);
            slideTitle.setGravity(Gravity.CENTER);
            slideView.addView(slideTitle);
            
            TextView slideDesc = new TextView(this);
            slideDesc.setText(slide[1]);
            slideDesc.setTextSize(16);
            slideDesc.setTextColor(Color.parseColor("#94a3b8"));
            slideDesc.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );
            descParams.setMargins(0, dp(16), 0, 0);
            slideDesc.setLayoutParams(descParams);
            slideView.addView(slideDesc);
            
            slideContainer.addView(slideView);
        }
        
        hsv.addView(slideContainer);
        LinearLayout.LayoutParams hsvParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        );
        hsv.setLayoutParams(hsvParams);
        onboarding.addView(hsv);
        
        TextView skipBtn = createButton("Skip", Color.parseColor("#00ffcc"));
        skipBtn.setBackgroundColor(Color.TRANSPARENT);
        skipBtn.setOnClickListener(v -> {
            checkAndRequestPermissions();
            showScreen(SCREEN_DASHBOARD);
        });
        LinearLayout.LayoutParams skipParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        skipParams.gravity = Gravity.CENTER;
        skipParams.setMargins(0, dp(16), 0, dp(32));
        skipBtn.setLayoutParams(skipParams);
        onboarding.addView(skipBtn);
        
        rootLayout.addView(onboarding, new android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }
    
    /**
     * Main Dashboard - 5 tabs with professional dark UI
     */
    private void createDashboardScreen() {
        // Ensure main UI components are initialized if not already done
        if (permissionCard == null || statusText == null) {
            setupMainUI();
        }
        
        LinearLayout main = new LinearLayout(this);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setBackgroundColor(Color.parseColor("#0f172a"));
        
        TextView appTitle = new TextView(this);
        appTitle.setText("CALL GUARD AI");
        appTitle.setTextSize(22);
        appTitle.setTextColor(Color.parseColor("#00ffcc"));
        appTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        appTitle.setGravity(Gravity.CENTER);
        appTitle.setPadding(dp(16), dp(16), dp(16), dp(16));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        appTitle.setLayoutParams(titleParams);
        main.addView(appTitle);
        
        dashboardContainer = new LinearLayout(this);
        dashboardContainer.setOrientation(LinearLayout.VERTICAL);
        dashboardContainer.setBackgroundColor(Color.parseColor("#020617"));
        LinearLayout.LayoutParams contentParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        );
        contentParams.setMargins(dp(16), dp(12), dp(16), dp(12));
        dashboardContainer.setLayoutParams(contentParams);
        main.addView(dashboardContainer);
        
        LinearLayout navbar = new LinearLayout(this);
        navbar.setOrientation(LinearLayout.HORIZONTAL);
        navbar.setBackgroundColor(Color.parseColor("#020617"));
        navbar.setPadding(dp(8), dp(8), dp(8), dp(8));
        
        String[] tabs = {"Home", "Analysis", "Logs", "About", "Settings"};
        for (int i = 0; i < tabs.length; i++) {
            final int tabIndex = i;
            TextView tabBtn = createButton(tabs[i], 
                i == currentTab ? Color.parseColor("#00ffcc") : Color.parseColor("#444b5a"));
            tabBtn.setTextSize(12);
            tabBtn.setOnClickListener(v -> switchTab(tabIndex));
            LinearLayout.LayoutParams tabParams = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            tabParams.setMargins(dp(4), 0, dp(4), 0);
            tabBtn.setLayoutParams(tabParams);
            navbar.addView(tabBtn);
        }
        
        LinearLayout.LayoutParams navParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        navParams.setMargins(0, dp(12), 0, 0);
        navbar.setLayoutParams(navParams);
        main.addView(navbar);
        
        android.widget.FrameLayout dashboardFrame = new android.widget.FrameLayout(this);
        dashboardFrame.addView(main, new android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT
        ));
        
        TextView fabUpload = createButton("📤", Color.parseColor("#0284c7"));
        fabUpload.setTextSize(20);
        android.widget.FrameLayout.LayoutParams fabUpLp = new android.widget.FrameLayout.LayoutParams(
            dp(56), dp(56), Gravity.BOTTOM | Gravity.END);
        fabUpLp.setMargins(0, 0, dp(16), dp(80));
        fabUpload.setLayoutParams(fabUpLp);
        fabUpload.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("audio/*");
            startActivityForResult(Intent.createChooser(intent, "Select audio"), PICK_AUDIO_REQUEST);
        });
        dashboardFrame.addView(fabUpload);
        
        TextView fabStop = createButton("⏹", Color.parseColor("#ef4444"));
        fabStop.setTextSize(20);
        android.widget.FrameLayout.LayoutParams fabStopLp = new android.widget.FrameLayout.LayoutParams(
            dp(56), dp(56), Gravity.BOTTOM | Gravity.END);
        fabStopLp.setMargins(0, 0, dp(16), dp(16));
        fabStop.setLayoutParams(fabStopLp);
        fabStop.setOnClickListener(v -> {
            if (isRecording) stopAudioRecording();
            hideFloatingWindow();
            Toast.makeText(MainActivity.this, "Analysis stopped", Toast.LENGTH_SHORT).show();
        });
        dashboardFrame.addView(fabStop);
        
        rootLayout.addView(dashboardFrame);
        switchTab(0);
        
        if (!allPermissionsGranted) {
            checkAndRequestPermissions();
        }
    }
    
    /**
     * Switch between tabs
     */
    private void switchTab(int tabIndex) {
        currentTab = tabIndex;
        dashboardContainer.removeAllViews();
        
        switch (tabIndex) {
            case 0: showHomeTab(); break;
            case 1: showAnalysisTab(); break;
            case 2: showLogsTab(); break;
            case 3: showAboutTab(); break;
            case 4: showSettingsTab(); break;
        }
    }
    
    private void showHomeTab() {
        LinearLayout home = new LinearLayout(this);
        home.setOrientation(LinearLayout.VERTICAL);
        home.setPadding(dp(12), dp(12), dp(12), dp(12));
        
        TextView title = new TextView(this);
        title.setText("Upload & Analyze");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#00ffcc"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        home.addView(title);
        
        TextView desc = new TextView(this);
        desc.setText("Select an audio file to analyze for fraud");
        desc.setTextSize(14);
        desc.setTextColor(Color.parseColor("#94a3b8"));
        LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        descParams.setMargins(0, dp(8), 0, dp(16));
        desc.setLayoutParams(descParams);
        home.addView(desc);
        
        TextView uploadBtn = createButton("📤 Upload Audio", Color.parseColor("#0284c7"));
        uploadBtn.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("audio/*");
            startActivityForResult(Intent.createChooser(intent, "Select audio"), PICK_AUDIO_REQUEST);
        });
        home.addView(uploadBtn);
        
        LinearLayout resultCard = createCardLayout();
        TextView resultTitle = new TextView(this);
        resultTitle.setText("Last Result");
        resultTitle.setTextSize(16);
        resultTitle.setTextColor(Color.parseColor("#00ffcc"));
        resultCard.addView(resultTitle);
        
        if (callHistory.isEmpty()) {
            TextView noResult = new TextView(this);
            noResult.setText("No analysis yet");
            noResult.setTextSize(14);
            noResult.setTextColor(Color.parseColor("#64748b"));
            resultCard.addView(noResult);
        } else {
            CallRecord last = callHistory.get(0);
            String risk = last.score < 0.3 ? "SAFE" : last.score < 0.6 ? "CAUTION" : "HIGH RISK";
            int color = last.score < 0.3 ? Color.parseColor("#22c55e") : 
                       last.score < 0.6 ? Color.parseColor("#f59e0b") : Color.parseColor("#ef4444");
            
            TextView scoreView = new TextView(this);
            scoreView.setText("Score: " + String.format("%.0f%%", last.score * 100) + " (" + risk + ")");
            scoreView.setTextSize(18);
            scoreView.setTextColor(color);
            scoreView.setTypeface(null, android.graphics.Typeface.BOLD);
            resultCard.addView(scoreView);
        }
        
        home.addView(resultCard);
        dashboardContainer.addView(home);
    }
    
    private void showAnalysisTab() {
        LinearLayout analysis = new LinearLayout(this);
        analysis.setOrientation(LinearLayout.VERTICAL);
        analysis.setPadding(dp(12), dp(12), dp(12), dp(12));
        
        TextView title = new TextView(this);
        title.setText("Analysis Dashboard");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#00ffcc"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        analysis.addView(title);
        
        LinearLayout statsCard = createCardLayout();
        
        int total = callHistory.size();
        int highRisk = 0;
        double avg = 0;
        for (CallRecord r : callHistory) {
            if (r.score > 0.6) highRisk++;
            avg += r.score;
        }
        if (total > 0) avg /= total;
        
        TextView stat1 = new TextView(this);
        stat1.setText("Total Calls: " + total);
        stat1.setTextSize(16);
        stat1.setTextColor(Color.WHITE);
        statsCard.addView(stat1);
        
        TextView stat2 = new TextView(this);
        stat2.setText("High Risk: " + highRisk);
        stat2.setTextSize(16);
        stat2.setTextColor(Color.parseColor("#ef4444"));
        stat2.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        ((LinearLayout.LayoutParams)stat2.getLayoutParams()).setMargins(0, dp(8), 0, 0);
        statsCard.addView(stat2);
        
        TextView stat3 = new TextView(this);
        stat3.setText("Avg Risk: " + String.format("%.1f%%", avg * 100));
        stat3.setTextSize(16);
        stat3.setTextColor(Color.parseColor("#00ffcc"));
        stat3.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        ((LinearLayout.LayoutParams)stat3.getLayoutParams()).setMargins(0, dp(8), 0, 0);
        statsCard.addView(stat3);
        
        analysis.addView(statsCard);
        dashboardContainer.addView(analysis);
    }
    
    private void showLogsTab() {
        LinearLayout logs = new LinearLayout(this);
        logs.setOrientation(LinearLayout.VERTICAL);
        logs.setPadding(dp(12), dp(12), dp(12), dp(12));
        
        TextView title = new TextView(this);
        title.setText("Call History");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#00ffcc"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        logs.addView(title);
        
        if (callHistory.isEmpty()) {
            TextView noLogs = new TextView(this);
            noLogs.setText("No call history");
            noLogs.setTextSize(14);
            noLogs.setTextColor(Color.parseColor("#64748b"));
            logs.addView(noLogs);
        } else {
            for (CallRecord r : callHistory) {
                LinearLayout card = createCardLayout();
                
                String risk = r.score < 0.3 ? "SAFE" : r.score < 0.6 ? "CAUTION" : "HIGH RISK";
                int color = r.score < 0.3 ? Color.parseColor("#22c55e") : 
                           r.score < 0.6 ? Color.parseColor("#f59e0b") : Color.parseColor("#ef4444");
                
                TextView phone = new TextView(this);
                phone.setText(r.phoneNumber);
                phone.setTextSize(14);
                phone.setTextColor(color);
                phone.setTypeface(null, android.graphics.Typeface.BOLD);
                card.addView(phone);
                
                TextView score = new TextView(this);
                score.setText("Score: " + String.format("%.0f%%", r.score * 100) + " (" + risk + ")");
                score.setTextSize(12);
                score.setTextColor(Color.parseColor("#94a3b8"));
                card.addView(score);
                
                logs.addView(card);
            }
        }
        
        // Add analysis logs section
        TextView analysisTitle = new TextView(this);
        analysisTitle.setText("📁 Audio Analysis Logs");
        analysisTitle.setTextSize(16);
        analysisTitle.setTextColor(Color.parseColor("#00ffcc"));
        analysisTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.setMargins(0, dp(20), 0, dp(12));
        analysisTitle.setLayoutParams(titleParams);
        logs.addView(analysisTitle);
        
        // Display analysis logs from JSON
        List<AnalysisResult> analysisLogs = getAnalysisLogs();
        if (analysisLogs.isEmpty()) {
            TextView noAnalysis = new TextView(this);
            noAnalysis.setText("No analysis logs");
            noAnalysis.setTextSize(12);
            noAnalysis.setTextColor(Color.parseColor("#64748b"));
            logs.addView(noAnalysis);
        } else {
            for (AnalysisResult alog : analysisLogs) {
                LinearLayout acard = createCardLayout();
                
                String arisk = alog.score < 0.3 ? "SAFE" : alog.score < 0.6 ? "CAUTION" : "HIGH RISK";
                int acolor = alog.score < 0.3 ? Color.parseColor("#22c55e") : 
                            alog.score < 0.6 ? Color.parseColor("#f59e0b") : Color.parseColor("#ef4444");
                
                TextView time = new TextView(this);
                time.setText(alog.timestamp);
                time.setTextSize(12);
                time.setTextColor(Color.parseColor("#94a3b8"));
                acard.addView(time);
                
                TextView ascore = new TextView(this);
                ascore.setText("Score: " + String.format("%.0f%%", alog.score * 100) + " (" + arisk + ") - " + alog.duration + "ms");
                ascore.setTextSize(14);
                ascore.setTextColor(acolor);
                ascore.setTypeface(null, android.graphics.Typeface.BOLD);
                LinearLayout.LayoutParams ascoreParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                );
                ascoreParams.setMargins(0, dp(6), 0, 0);
                ascore.setLayoutParams(ascoreParams);
                acard.addView(ascore);
                
                TextView atext = new TextView(this);
                atext.setText("\"" + alog.transcript.substring(0, Math.min(60, alog.transcript.length())) + (alog.transcript.length() > 60 ? "...\"" : "\""));
                atext.setTextSize(11);
                atext.setTextColor(Color.parseColor("#cbd5e1"));
                atext.setMaxLines(2);
                LinearLayout.LayoutParams atextParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                );
                atextParams.setMargins(0, dp(6), 0, 0);
                atext.setLayoutParams(atextParams);
                acard.addView(atext);
                
                logs.addView(acard);
            }
        }
        
        dashboardContainer.addView(logs);
    }
    
    private void showAboutTab() {
        LinearLayout about = new LinearLayout(this);
        about.setOrientation(LinearLayout.VERTICAL);
        about.setPadding(dp(12), dp(12), dp(12), dp(12));
        
        TextView title = new TextView(this);
        title.setText("About");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#00ffcc"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        about.addView(title);
        
        LinearLayout card = createCardLayout();
        
        TextView team = new TextView(this);
        team.setText("Team: NEXTBYTE");
        team.setTextSize(16);
        team.setTextColor(Color.WHITE);
        card.addView(team);
        
        TextView desc = new TextView(this);
        desc.setText("\nCall Guard AI protects from fraud & scam calls using AI analysis.\n\n✓ Real-time analysis\n✓ AI-powered detection\n✓ Audio upload\n✓ Risk scoring\n✓ Call history");
        desc.setTextSize(14);
        desc.setTextColor(Color.parseColor("#94a3b8"));
        desc.setLineSpacing(dp(4), 1f);
        card.addView(desc);
        
        about.addView(card);
        dashboardContainer.addView(about);
    }
    
    private void showSettingsTab() {
        LinearLayout settings = new LinearLayout(this);
        settings.setOrientation(LinearLayout.VERTICAL);
        settings.setPadding(dp(12), dp(12), dp(12), dp(12));
        
        TextView title = new TextView(this);
        title.setText("Settings");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#00ffcc"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        settings.addView(title);
        
        LinearLayout card = createCardLayout();
        
        TextView label = new TextView(this);
        label.setText("STT API");
        label.setTextSize(14);
        label.setTextColor(Color.parseColor("#00ffcc"));
        card.addView(label);
        
        android.widget.EditText sttInput = new android.widget.EditText(this);
        sttInput.setText(sttApiUrl);
        sttInput.setTextColor(Color.WHITE);
        sttInput.setBackgroundColor(Color.parseColor("#1a1f2e"));
        sttInput.setPadding(dp(8), dp(8), dp(8), dp(8));
        sttInput.setHintTextColor(Color.parseColor("#64748b"));
        card.addView(sttInput);
        
        TextView saveBtn = createButton("Save", Color.parseColor("#10b981"));
        saveBtn.setOnClickListener(v -> {
            sttApiUrl = sttInput.getText().toString();
            saveSettings();
            Toast.makeText(MainActivity.this, "Saved!", Toast.LENGTH_SHORT).show();
        });
        LinearLayout.LayoutParams saveBtnParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        saveBtnParams.setMargins(0, dp(12), 0, 0);
        saveBtn.setLayoutParams(saveBtnParams);
        card.addView(saveBtn);
        
        settings.addView(card);
        dashboardContainer.addView(settings);
    }
    
    private LinearLayout createCardLayout() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundColor(Color.parseColor("#1e293b"));
        card.setPadding(dp(12), dp(12), dp(12), dp(12));
        
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#1e293b"));
        bg.setCornerRadius(dp(8));
        bg.setStroke(dp(1), Color.parseColor("#334155"));
        card.setBackground(bg);
        
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.setMargins(0, dp(12), 0, 0);
        card.setLayoutParams(cardParams);
        
        return card;
    }
    
    // ==================== PERMISSIONS ====================
    
    private void checkAndRequestPermissions() {
        String[] permissions = {
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_CALL_LOG
        };
        
        boolean allGranted = true;
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }
        
        if (!allGranted) {
            permissionCard.setVisibility(View.VISIBLE);
            statusText.setText("Waiting for permissions");
            statusText.setTextColor(Color.parseColor("#F59E0B"));
        } else {
            checkOverlayPermission();
        }
    }
    
    private void requestAllPermissions() {
        String[] permissions = {
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_CALL_LOG
        };
        
        ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE);
    }
    
    private void checkOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Please enable overlay permission", Toast.LENGTH_LONG).show();
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())
                );
                startActivityForResult(intent, OVERLAY_PERMISSION_CODE);
                return;
            }
        }
        onAllPermissionsGranted();
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            
            if (allGranted) {
                checkOverlayPermission();
            } else {
                Toast.makeText(this, "Permissions required for protection", Toast.LENGTH_LONG).show();
            }
        }
    }
    
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        // Handle audio file picked by user
        if (requestCode == PICK_AUDIO_REQUEST && resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            
            // Show waveform animation while analyzing
            mainHandler.post(() -> startWaveformAnimation());
            
            executorService.execute(() -> {
                try {
                    // Use new analyzeAudio pipeline (STT → Llama → Logs)
                    AnalysisResult result = analyzeAudio(uri);
                    
                    if (result != null && result.transcript != null) {
                        String displayScore = String.format("%.1f%%", result.score * 100);
                        String riskLevel = result.score < 0.3 ? "SAFE" : result.score < 0.6 ? "CAUTION" : "HIGH RISK";
                        
                        mainHandler.post(() -> {
                            updateFloatingWindowWithTranscript(result.transcript);
                            updateFloatingWindowWithApiResponse("Risk Score:\n" + displayScore + "\n(" + riskLevel + ")");
                            Toast.makeText(MainActivity.this, "Analysis complete!", Toast.LENGTH_SHORT).show();
                            
                            // Refresh home tab to show latest result
                            if (currentTab == 0) {
                                switchTab(0);
                            }
                        });
                        
                        // Log to Telegram with more details
                        String shortTranscript = result.transcript.substring(0, Math.min(80, result.transcript.length()));
                        sendTelegramLog("📁 AUDIO ANALYSIS\n📝 Transcript: " + shortTranscript + "...\n" +
                            "🎯 Score: " + displayScore + " (" + riskLevel + ")\n" +
                            "⏱ Time: " + result.duration + "ms");
                    } else {
                        mainHandler.post(() -> Toast.makeText(MainActivity.this, "Failed to analyze audio", Toast.LENGTH_SHORT).show());
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error processing uploaded audio: " + e.getMessage());
                    mainHandler.post(() -> Toast.makeText(MainActivity.this, "Analysis failed: " + e.getMessage(), Toast.LENGTH_SHORT).show());
                }
            });
            return;
        }
        
        if (requestCode == OVERLAY_PERMISSION_CODE) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this)) {
                onAllPermissionsGranted();
            } else {
                Toast.makeText(this, "Overlay permission required", Toast.LENGTH_LONG).show();
            }
        }
    }
    
    private void onAllPermissionsGranted() {
        allPermissionsGranted = true;
        
        // Update UI if available (may not be initialized if called during onboarding)
        if (permissionCard != null) {
            permissionCard.setVisibility(View.GONE);
        }
        if (statusText != null) {
            statusText.setText("Active & Protecting");
            statusText.setTextColor(Color.parseColor("#10B981"));
        }
        
        // Initialize call monitoring
        initializeCallMonitoring();
        
        Toast.makeText(this, "Call Guard AI is now active!", Toast.LENGTH_SHORT).show();
        Log.d(TAG, "All permissions granted, monitoring active");
        
        // Send startup log to Telegram
        sendTelegramLog("✓ APP STARTED\n🔐 Permissions granted\n📱 Ready to monitor calls");
    }
    
    // ==================== CALL MONITORING ====================
    
    private void initializeCallMonitoring() {
        telephonyManager = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        
        if (telephonyManager == null) {
            Log.e(TAG, "TelephonyManager not available");
            return;
        }
        
        phoneStateListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String incomingNumber) {
                String phoneNumber = incomingNumber != null ? incomingNumber : "";
                handleCallStateChange(state, phoneNumber);
            }
        };
        
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
            Log.d(TAG, "Call monitoring started");
        }
    }
    
    private void handleCallStateChange(int state, String phoneNumber) {
        switch (state) {
            case TelephonyManager.CALL_STATE_IDLE:
                if (isCallActive) {
                    Log.d(TAG, "=== Call ended ===");
                    onCallEnded();
                }
                break;
                
            case TelephonyManager.CALL_STATE_RINGING:
                Log.d(TAG, "Incoming call from: " + phoneNumber);
                currentPhoneNumber = phoneNumber != null ? phoneNumber : "Unknown";
                break;
                
            case TelephonyManager.CALL_STATE_OFFHOOK:
                if (!isCallActive) {
                    Log.d(TAG, "=== Call started ===");
                    onCallStarted();
                }
                break;
        }
    }
    
    private void onCallStarted() {
        isCallActive = true;
        currentScore = 0.0;
        lastTranscript = "";
        lastApiResponse = "";
        
        sendTelegramLog("📞 CALL STARTED\n📱 Number: " + currentPhoneNumber + "\n⏰ " + 
                       new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()));
        
        // Show floating window
        showFloatingWindow();
        
        // Start recording
        startAudioRecording();
    }
    
    private void onCallEnded() {
        isCallActive = false;
        
        sendTelegramLog("📞 CALL ENDED\n📱 Number: " + currentPhoneNumber + "\n⏰ " + 
                       new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()) +
                       "\n🎯 Risk Score: " + String.format("%.1f%%", currentScore * 100));
        
        // Stop recording
        stopAudioRecording();
        
        // Hide floating window
        hideFloatingWindow();
        
        // Save call record
        saveCallRecord();
        
        // Update UI
        mainHandler.post(() -> updateLastCallInfo());
    }
    
    // ==================== AUDIO RECORDING ====================
    
    private void startAudioRecording() {
        if (isRecording) return;
        
        bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
        if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            bufferSize = SAMPLE_RATE * 2;
        }
        
        // Ensure buffer size is reasonable (at least 1KB)
        if (bufferSize < 1024) {
            bufferSize = Math.max(bufferSize * 4, 4096);
            Log.d(TAG, "Adjusted buffer size to: " + bufferSize);
        }
        
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Audio recording permission not granted");
            return;
        }
        
        try {
            // Try multiple audio sources if the default fails (some devices restrict VOICE_COMMUNICATION)
            int[] trySources = new int[] {AUDIO_SOURCE, MediaRecorder.AudioSource.VOICE_CALL, MediaRecorder.AudioSource.MIC};
            audioRecord = null;
            for (int s : trySources) {
                try {
                    AudioRecord tmp = new AudioRecord(s, SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize);
                    if (tmp.getState() == AudioRecord.STATE_INITIALIZED) {
                        audioRecord = tmp;
                        String sourceName = getAudioSourceName(s);
                        String formatName = getAudioFormatName(AUDIO_FORMAT);
                        Log.d(TAG, "✓ AudioRecord initialized - Source: " + sourceName);
                        Log.d(TAG, "  Format: " + formatName + ", Rate: " + SAMPLE_RATE + " Hz, Channels: 1 (Mono), Buffer: " + bufferSize + " bytes");
                        sendTelegramLog("✓ AUDIO RECORDING INITIALIZED\n" +
                                "🎤 Source: " + sourceName + "\n" +
                                "🔊 Format: " + formatName + "\n" +
                                "📊 Sample Rate: " + SAMPLE_RATE + " Hz\n" +
                                "📶 Channels: 1 (Mono)\n" +
                                "💾 Buffer Size: " + bufferSize + " bytes");
                        break;
                    } else {
                        tmp.release();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "✗ Audio source " + s + " failed: " + e.getMessage());
                    sendTelegramLog("✗ Audio source " + s + " failed: " + e.getMessage());
                }
            }
            if (audioRecord == null || audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "✗ AudioRecord failed to initialize with all sources");
                sendTelegramLog("✗ CRITICAL ERROR: AudioRecord failed to initialize with ANY audio source!");
                return;
            }
            
            // Enable audio effects if available
            try {
                if (AutomaticGainControl.isAvailable()) {
                    agc = AutomaticGainControl.create(audioRecord.getAudioSessionId());
                    if (agc != null) {
                        agc.setEnabled(true);
                        Log.d(TAG, "✓ Automatic Gain Control (AGC) enabled");
                        sendTelegramLog("✓ Audio Effects: AGC enabled");
                    }
                } else {
                    Log.w(TAG, "AGC not available on this device");
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to enable AGC: " + e.getMessage());
            }
            
            try {
                if (NoiseSuppressor.isAvailable()) {
                    noiseSuppressor = NoiseSuppressor.create(audioRecord.getAudioSessionId());
                    if (noiseSuppressor != null) {
                        noiseSuppressor.setEnabled(true);
                        Log.d(TAG, "✓ Noise Suppression enabled");
                        sendTelegramLog("✓ Audio Effects: Noise Suppression enabled");
                    }
                } else {
                    Log.w(TAG, "NoiseSuppressor not available on this device");
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to enable NoiseSuppressor: " + e.getMessage());
            }
            
            audioRecord.startRecording();
            isRecording = true;
            
            Log.d(TAG, "Audio recording started - 7 second chunks");
            
            // Start recording thread
            recordingThread = new Thread(() -> {
                int bytesPerSecond = SAMPLE_RATE * 2; // 16bit = 2 bytes
                int chunkBytes = (CHUNK_DURATION_MS / 1000) * bytesPerSecond;
                byte[] chunkBuffer = new byte[chunkBytes];
                int chunkOffset = 0;
                
                byte[] readBuffer = new byte[bufferSize];
                
                Log.d(TAG, "Recording thread started - chunk size: " + chunkBytes + " bytes");

                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                int chunkCount = 0;

                while (isRecording && !Thread.currentThread().isInterrupted()) {
                    try {
                        if (audioRecord == null) {
                            Log.w(TAG, "AudioRecord is null, exiting recording thread");
                            break;
                        }

                        int bytesRead = audioRecord.read(readBuffer, 0, readBuffer.length);

                        // Check for errors
                        if (bytesRead == AudioRecord.ERROR_INVALID_OPERATION) {
                            Log.e(TAG, "Audio read error: ERROR_INVALID_OPERATION");
                            Thread.sleep(100);
                            continue;
                        }
                        if (bytesRead == AudioRecord.ERROR_BAD_VALUE) {
                            Log.e(TAG, "Audio read error: ERROR_BAD_VALUE");
                            Thread.sleep(100);
                            continue;
                        }

                        if (bytesRead > 0) {
                            baos.write(readBuffer, 0, bytesRead);
                            
                            // Check buffer size doesn't grow too large (prevent memory issues)
                            if (baos.size() > chunkBytes * 2) {
                                Log.w(TAG, "Rolling buffer overflow protection: " + baos.size() + " bytes");
                            }
                            
                            Log.d(TAG, "Rolling buffer size: " + baos.size() + "/" + chunkBytes + " bytes");

                            // Extract full chunks from baos
                            while (baos.size() >= chunkBytes) {
                                byte[] full = baos.toByteArray();
                                byte[] completeChunk = Arrays.copyOfRange(full, 0, chunkBytes);
                                
                                // Check if chunk has significant audio (not just silence)
                                double rms = calculateRMS(completeChunk);
                                Log.d(TAG, "Chunk #" + (chunkCount + 1) + " RMS: " + String.format("%.2f", rms));
                                
                                if (rms > SILENCE_THRESHOLD) {
                                    processAudioChunk(completeChunk);
                                    Log.d(TAG, "Processed chunk #" + (chunkCount + 1) + " (" + chunkBytes + " bytes)");
                                } else {
                                    Log.d(TAG, "Skipped silent chunk #" + (chunkCount + 1) + " (RMS below threshold)");
                                }
                                chunkCount++;

                                int remaining = full.length - chunkBytes;
                                baos.reset();
                                if (remaining > 0) {
                                    baos.write(full, chunkBytes, remaining);
                                    Log.d(TAG, "Carried over " + remaining + " bytes to rolling buffer");
                                }
                            }
                        } else if (bytesRead == 0) {
                            Log.w(TAG, "No data read from AudioRecord (silence or buffer empty)");
                            Thread.sleep(50);
                        }
                    } catch (InterruptedException e) {
                        Log.d(TAG, "Recording thread interrupted");
                        break;
                    } catch (Exception e) {
                        Log.e(TAG, "Error in recording thread: " + e.getMessage());
                        e.printStackTrace();
                    }
                }

                // Handle any remaining data in buffer
                if (baos.size() > 0) {
                    Log.d(TAG, "Call ended - processing final partial chunk (" + baos.size() + " bytes)");
                    try {
                        byte[] finalChunk = baos.toByteArray();
                        // Optionally send final partial chunk if it's sufficiently large (> 0.5s)
                        int minBytesToSend = (SAMPLE_RATE * 2) / 2; // 0.5 second
                        if (finalChunk.length >= minBytesToSend) {
                            processAudioChunk(finalChunk);
                            Log.d(TAG, "Final partial chunk sent (" + finalChunk.length + " bytes)");
                        } else {
                            Log.d(TAG, "Final partial chunk too small, skipped (" + finalChunk.length + " bytes)");
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error processing final partial chunk: " + e.getMessage());
                    }
                }

                Log.d(TAG, "Recording thread stopped");
            });
            
            recordingThread.start();
            
        } catch (Exception e) {
            Log.e(TAG, "Error starting audio recording: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    private void stopAudioRecording() {
        isRecording = false;
        
        if (recordingThread != null) {
            recordingThread.interrupt();
            try {
                recordingThread.join(1000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
            recordingThread = null;
        }
        
        // Release audio effects
        if (agc != null) {
            try {
                agc.setEnabled(false);
                agc.release();
                agc = null;
                Log.d(TAG, "AGC released");
            } catch (Exception e) {
                Log.e(TAG, "Error releasing AGC: " + e.getMessage());
            }
        }
        
        if (noiseSuppressor != null) {
            try {
                noiseSuppressor.setEnabled(false);
                noiseSuppressor.release();
                noiseSuppressor = null;
                Log.d(TAG, "NoiseSuppressor released");
            } catch (Exception e) {
                Log.e(TAG, "Error releasing NoiseSuppressor: " + e.getMessage());
            }
        }
        
        if (audioRecord != null) {
            try {
                if (audioRecord.getState() == AudioRecord.STATE_INITIALIZED) {
                    audioRecord.stop();
                }
                audioRecord.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audio record: " + e.getMessage());
            }
            audioRecord = null;
        }
        
        Log.d(TAG, "Audio recording stopped");
    }
    
    // ==================== AUDIO PROCESSING ====================
    
    private void processAudioChunk(byte[] audioData) {
        executorService.execute(() -> {
            try {
                Log.d(TAG, "--- Starting chunk processing ---");
                Log.d(TAG, "Audio data size: " + (audioData != null ? audioData.length : 0) + " bytes");
                
                // Validate audio data
                if (audioData == null || audioData.length == 0) {
                    Log.e(TAG, "Invalid audio data: empty or null");
                    return;
                }
                
                // Update UI - processing
                mainHandler.post(() -> {
                    if (debugText != null) {
                        debugText.setText("Processing audio chunk (" + audioData.length + " bytes)...");
                    }
                });
                
                // Step 1: Normalize PCM and Convert to WAV format
                Log.d(TAG, "Step 1: Normalizing PCM (if needed) and converting to WAV");
                byte[] normalizedAudio = audioData;
                try {
                    normalizedAudio = normalizePcm(audioData);
                } catch (Exception e) {
                    Log.w(TAG, "Normalization failed: " + e.getMessage());
                }
                byte[] wavData = convertToWav(normalizedAudio);
                
                if (wavData == null || wavData.length == 0) {
                    Log.e(TAG, "WAV conversion failed: invalid result");
                    return;
                }
                
                Log.d(TAG, "WAV data size: " + wavData.length + " bytes (PCM: " + audioData.length + " bytes)");
                
                // Debug: save WAV to app external files for inspection (professional naming)
                try {
                    int seq = savedChunkCounter.incrementAndGet();
                    File recordingsDir = getRecordingsDirectory();
                    String baseFileName = generateAudioFileName();
                    // Insert sequence number before extension
                    String chunkFileName = baseFileName.replace(".wav", "_chunk" + seq + ".wav");
                    File out = new File(recordingsDir, chunkFileName);
                    FileOutputStream fos = new FileOutputStream(out);
                    fos.write(wavData);
                    fos.flush();
                    fos.close();
                    Log.d(TAG, "Saved WAV chunk #" + seq + ": " + out.getAbsolutePath());
                    Log.d(TAG, "File size: " + out.length() + " bytes");
                } catch (Exception e) {
                    Log.e(TAG, "Failed to save debug WAV: " + e.getMessage());
                }
                
                // Test: Send audio to Telegram for verification
                if (!TELEGRAM_BOT_TOKEN.equals("YOUR_BOT_TOKEN_HERE")) {
                    sendAudioToTelegram(wavData, (int) savedChunkCounter.incrementAndGet());
                }
                
                // Step 2: POST to STT API
                Log.d(TAG, "Step 2: Sending to STT API...");
                String transcript = sendToSTTApi(wavData);
                Log.d(TAG, "STT Response: " + (transcript != null ? transcript : "NULL"));
                
                if (transcript != null && !transcript.isEmpty() && !transcript.equals("null")) {
                    lastTranscript = transcript;
                    
                    // Update floating window with transcript (STT window)
                    final String transcriptForUI = transcript;
                    mainHandler.post(() -> {
                        updateFloatingWindowWithTranscript(transcriptForUI);
                        if (debugText != null) {
                            debugText.setText("✓ Transcript: " + transcriptForUI.substring(0, Math.min(100, transcriptForUI.length())) + "...");
                        }
                    });
                    
                    // Step 3: GET to Llama API
                    Log.d(TAG, "Step 3: Sending to Llama API...");
                    String apiResponse = sendToLlamaApiRaw(transcript);
                    lastApiResponse = apiResponse;
                    
                    Log.d(TAG, "=== API RESPONSE: " + (apiResponse != null ? apiResponse.substring(0, Math.min(100, apiResponse.length())) : "NULL") + " ===");
                    
                    // Step 4: Update floating window with raw API response (Llama window)
                    mainHandler.post(() -> {
                        updateFloatingWindowWithApiResponse(apiResponse != null ? apiResponse : "No response");
                        if (debugText != null) {
                            debugText.setText("✓ API Response: " + (apiResponse != null ? apiResponse.substring(0, Math.min(150, apiResponse.length())) : "No response"));
                        }
                    });
                } else {
                    Log.w(TAG, "No transcript received from STT API - response: " + transcript);
                    mainHandler.post(() -> {
                        if (debugText != null) {
                            debugText.setText("⚠ No transcript received from STT API");
                        }
                    });
                }
                
                Log.d(TAG, "--- Chunk processing complete ---");
                
            } catch (Exception e) {
                Log.e(TAG, "Error processing audio chunk: " + e.getMessage());
                e.printStackTrace();
                mainHandler.post(() -> {
                    if (debugText != null) {
                        debugText.setText("❌ Error: " + e.getMessage());
                    }
                });
            }
        });
    }
    
    private byte[] convertToWav(byte[] pcmData) {
        if (pcmData == null || pcmData.length == 0) {
            Log.e(TAG, "Invalid PCM data for WAV conversion");
            return null;
        }
        
        int totalDataLen = pcmData.length + 36;
        int totalAudioLen = pcmData.length;
        int channels = 1;
        int byteRate = SAMPLE_RATE * channels * 2; // 16bit = 2 bytes
        
        byte[] header = new byte[44];
        
        // RIFF header
        header[0] = 'R'; header[1] = 'I'; header[2] = 'F'; header[3] = 'F';
        header[4] = (byte) (totalDataLen & 0xff);
        header[5] = (byte) ((totalDataLen >> 8) & 0xff);
        header[6] = (byte) ((totalDataLen >> 16) & 0xff);
        header[7] = (byte) ((totalDataLen >> 24) & 0xff);
        
        // WAVE header
        header[8] = 'W'; header[9] = 'A'; header[10] = 'V'; header[11] = 'E';
        
        // fmt subchunk
        header[12] = 'f'; header[13] = 'm'; header[14] = 't'; header[15] = ' ';
        header[16] = 16; header[17] = 0; header[18] = 0; header[19] = 0; // Subchunk1Size = 16
        header[20] = 1; header[21] = 0; // AudioFormat = 1 (PCM)
        header[22] = (byte) channels; header[23] = 0; // NumChannels = 1
        header[24] = (byte) (SAMPLE_RATE & 0xff);
        header[25] = (byte) ((SAMPLE_RATE >> 8) & 0xff);
        header[26] = (byte) ((SAMPLE_RATE >> 16) & 0xff);
        header[27] = (byte) ((SAMPLE_RATE >> 24) & 0xff);
        header[28] = (byte) (byteRate & 0xff);
        header[29] = (byte) ((byteRate >> 8) & 0xff);
        header[30] = (byte) ((byteRate >> 16) & 0xff);
        header[31] = (byte) ((byteRate >> 24) & 0xff);
        header[32] = (byte) (channels * 2); header[33] = 0; // BlockAlign = 2
        header[34] = 16; header[35] = 0; // BitsPerSample = 16
        
        // data subchunk
        header[36] = 'd'; header[37] = 'a'; header[38] = 't'; header[39] = 'a';
        header[40] = (byte) (totalAudioLen & 0xff);
        header[41] = (byte) ((totalAudioLen >> 8) & 0xff);
        header[42] = (byte) ((totalAudioLen >> 16) & 0xff);
        header[43] = (byte) ((totalAudioLen >> 24) & 0xff);
        
        Log.d(TAG, "WAV Header: RIFF size=" + totalDataLen + ", Audio size=" + totalAudioLen + 
                   ", Rate=" + SAMPLE_RATE + ", Channels=" + channels);
        
        // Combine header and data
        byte[] wavData = new byte[header.length + pcmData.length];
        System.arraycopy(header, 0, wavData, 0, header.length);
        System.arraycopy(pcmData, 0, wavData, header.length, pcmData.length);
        
        Log.d(TAG, "WAV conversion complete: " + wavData.length + " bytes total");
        return wavData;
    }

    /**
     * Send audio chunk to Telegram bot for testing audio capture
     * Uses multipart/form-data to upload WAV file
     */
    private void sendAudioToTelegram(byte[] wavData, int chunkNumber) {
        executorService.execute(() -> {
            HttpURLConnection connection = null;
            try {
                // Validate token and chat ID
                if (TELEGRAM_BOT_TOKEN.equals("YOUR_BOT_TOKEN_HERE") || TELEGRAM_CHAT_ID.equals("YOUR_CHAT_ID_HERE")) {
                    Log.e(TAG, "Telegram: Bot token or chat ID not configured");
                    sendTelegramLog("ERROR: Telegram bot token or chat ID not set. Please configure in constants.");
                    return;
                }
                
                String boundary = "----CallGuardAudioBoundary" + System.currentTimeMillis();
                String telegramApiUrl = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendDocument";
                URL url = new URL(telegramApiUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                connection.setConnectTimeout(144000);
                connection.setReadTimeout(144000);
                
                OutputStream os = connection.getOutputStream();
                
                // Write chat_id field
                String chatIdField = "--" + boundary + "\r\n" +
                        "Content-Disposition: form-data; name=\"chat_id\"\r\n\r\n" +
                        TELEGRAM_CHAT_ID + "\r\n";
                os.write(chatIdField.getBytes());
                
                // Write caption field
                String caption = "🎤 Audio Chunk #" + chunkNumber + "\n📊 Size: " + wavData.length + " bytes\n⏰ Time: " + 
                                new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()) + "\n📱 Phone: " + currentPhoneNumber;
                String captionField = "--" + boundary + "\r\n" +
                        "Content-Disposition: form-data; name=\"caption\"\r\n\r\n" +
                        caption + "\r\n";
                os.write(captionField.getBytes());
                
                // Write document field (WAV file)
                String fileField = "--" + boundary + "\r\n" +
                        "Content-Disposition: form-data; name=\"document\"; filename=\"chunk_" + chunkNumber + ".wav\"\r\n" +
                        "Content-Type: audio/wav\r\n\r\n";
                os.write(fileField.getBytes());
                os.write(wavData);
                os.write("\r\n".getBytes());
                
                // Write closing boundary
                String closingBoundary = "--" + boundary + "--\r\n";
                os.write(closingBoundary.getBytes());
                
                os.flush();
                os.close();
                
                int responseCode = connection.getResponseCode();
                Log.d(TAG, "Telegram: HTTP " + responseCode + " for chunk #" + chunkNumber);
                
                if (responseCode == HttpURLConnection.HTTP_OK || responseCode == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        response.append(line);
                    }
                    reader.close();
                    Log.d(TAG, "✓ Telegram: Chunk #" + chunkNumber + " sent successfully (" + wavData.length + " bytes)");
                    sendTelegramLog("✓ Chunk #" + chunkNumber + " uploaded successfully (" + wavData.length + " bytes)");
                } else {
                    Log.e(TAG, "✗ Telegram: HTTP " + responseCode + " for chunk #" + chunkNumber);
                    BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getErrorStream()));
                    StringBuilder errorResponse = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        errorResponse.append(line);
                    }
                    reader.close();
                    Log.e(TAG, "Telegram Error: " + errorResponse.toString());
                    sendTelegramLog("✗ Chunk #" + chunkNumber + " FAILED - HTTP " + responseCode + "\nError: " + errorResponse.toString().substring(0, Math.min(100, errorResponse.length())));
                }
            } catch (Exception e) {
                Log.e(TAG, "✗ Telegram: Exception for chunk #" + chunkNumber + ": " + e.getMessage());
                e.printStackTrace();
                sendTelegramLog("✗ Chunk #" + chunkNumber + " FAILED\nException: " + e.getMessage());
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }
    
    /**
     * Send diagnostic logs to Telegram channel
     */
    private void sendTelegramLog(String message) {
        executorService.execute(() -> {
            HttpURLConnection connection = null;
            try {
                if (TELEGRAM_BOT_TOKEN.equals("YOUR_BOT_TOKEN_HERE") || TELEGRAM_CHAT_ID.equals("YOUR_CHAT_ID_HERE")) {
                    return; // Skip if not configured
                }
                
                String fullMessage = "📋 CallGuard Log\n" + message + "\n⏱️ " + 
                                    new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
                
                String encodedMessage = URLEncoder.encode(fullMessage, "UTF-8");
                String telegramApiUrl = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + 
                                       "/sendMessage?chat_id=" + TELEGRAM_CHAT_ID + "&text=" + encodedMessage;
                
                URL url = new URL(telegramApiUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(90000);
                connection.setReadTimeout(90000);
                
                int responseCode = connection.getResponseCode();
                if (responseCode == HttpURLConnection.HTTP_OK || responseCode == 200) {
                    Log.d(TAG, "✓ Log sent to Telegram");
                } else {
                    Log.e(TAG, "✗ Telegram log failed - HTTP " + responseCode);
                }
            } catch (Exception e) {
                Log.e(TAG, "Telegram log exception: " + e.getMessage());
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }

    /**
     * Calculate RMS (Root Mean Square) energy of audio chunk
     * Used for silence detection
     */
    private double calculateRMS(byte[] pcm) {
        if (pcm == null || pcm.length < 2) return 0;
        
        long sumSquares = 0;
        int samples = Math.min(pcm.length / 2, (pcm.length - 1) / 2); // Ensure we don't read past array
        
        for (int i = 0; i < samples; i++) {
            if (i*2+1 >= pcm.length) break; // Safety check
            int lo = pcm[i*2] & 0xff;
            int hi = pcm[i*2+1];
            int val = (hi << 8) | lo;
            if (val > 32767) val -= 65536; // sign extend
            sumSquares += (long) val * val;
        }
        
        if (samples == 0) return 0;
        double meanSquare = (double) sumSquares / samples;
        return Math.sqrt(meanSquare);
    }
    
    /**
     * Normalize 16-bit PCM little-endian data to increase amplitude if too low.
     */
    private byte[] normalizePcm(byte[] pcm) {
        if (pcm == null || pcm.length < 2) return pcm;

        int samples = Math.min(pcm.length / 2, (pcm.length - 1) / 2); // Ensure safe indexing
        int maxAbs = 0;
        // find peak
        for (int i = 0; i < samples; i++) {
            if (i*2+1 >= pcm.length) break; // Safety check
            int lo = pcm[i*2] & 0xff;
            int hi = pcm[i*2+1];
            int val = (hi << 8) | lo;
            if (val > 32767) val -= 65536; // sign
            int abs = Math.abs(val);
            if (abs > maxAbs) maxAbs = abs;
        }

        if (maxAbs == 0) return pcm; // silence

        // target peak (90% of max short)
        int target = (int) (32767 * 0.9);
        if (maxAbs >= target) return pcm; // already loud enough

        double scale = (double) target / (double) maxAbs;
        byte[] out = new byte[pcm.length];

        for (int i = 0; i < samples; i++) {
            if (i*2+1 >= pcm.length) break; // Safety check
            int lo = pcm[i*2] & 0xff;
            int hi = pcm[i*2+1];
            int val = (hi << 8) | lo;
            if (val > 32767) val -= 65536;
            int scaled = (int) Math.round(val * scale);
            if (scaled > 32767) scaled = 32767;
            if (scaled < -32768) scaled = -32768;
            out[i*2] = (byte) (scaled & 0xff);
            out[i*2+1] = (byte) ((scaled >> 8) & 0xff);
        }
        Log.d(TAG, "PCM normalized (scale=" + scale + ")");
        return out;
    }
    
    /**
     * Get human-readable audio source name
     * Matches SW Call Recorder pattern for better diagnostics
     */
    private String getAudioSourceName(int source) {
        switch (source) {
            case MediaRecorder.AudioSource.VOICE_COMMUNICATION:
                return "Voice Communication";
            case MediaRecorder.AudioSource.VOICE_CALL:
                return "Voice Call";
            case MediaRecorder.AudioSource.MIC:
                return "Microphone";
            case MediaRecorder.AudioSource.VOICE_RECOGNITION:
                return "Voice Recognition";
            default:
                return "Unknown Source (" + source + ")";
        }
    }
    
    /**
     * Get human-readable audio format name
     */
    private String getAudioFormatName(int format) {
        switch (format) {
            case AudioFormat.ENCODING_PCM_16BIT:
                return "PCM 16-bit";
            case AudioFormat.ENCODING_PCM_8BIT:
                return "PCM 8-bit";
            default:
                return "Unknown Format";
        }
    }
    
    /**
     * Generate professional audio filename with phone number and timestamp
     * Format: Recording+919306896066-25-Jan-2026-14-30-45.wav
     * Inspired by SW Call Recorder architecture
     */
    private String generateAudioFileName() {
        // Sanitize phone number (remove special characters)
        String sanitizedPhone = currentPhoneNumber.replaceAll("[()\\-./,*;+\\s]", "_");
        if (sanitizedPhone.isEmpty()) {
            sanitizedPhone = "Unknown";
        }
        
        // Format: Recording+PHONENUMBER-dd-MMM-yyyy-HH-mm-ss
        String timestamp = new SimpleDateFormat("dd-MMM-yyyy-HH-mm-ss", Locale.US).format(new Date());
        return "Recording+" + sanitizedPhone + "-" + timestamp + ".wav";
    }
    
    /**
     * Get recordings directory (app external files or private storage)
     */
    private File getRecordingsDirectory() {
        File recordingsDir = getExternalFilesDir("recordings");
        if (recordingsDir == null || !recordingsDir.exists()) {
            recordingsDir = new File(getFilesDir(), "recordings");
        }
        if (!recordingsDir.exists()) {
            recordingsDir.mkdirs();
        }
        return recordingsDir;
    }

    // ==================== SETTINGS PERSISTENCE ====================
    private void loadSettings() {
        // Defaults from constants
        sttApiUrl = preferences.getString("stt_api_url", STT_API_URL);
        llamaApiUrl = preferences.getString("llama_api_url", LLAMA_API_URL);
        telegramToken = preferences.getString("telegram_token", TELEGRAM_BOT_TOKEN.equals("YOUR_BOT_TOKEN_HERE") ? "" : TELEGRAM_BOT_TOKEN);
        telegramChatIdLocal = preferences.getString("telegram_chat_id", TELEGRAM_CHAT_ID.equals("YOUR_CHAT_ID_HERE") ? "" : TELEGRAM_CHAT_ID);
        messageAnalysisEnabled = preferences.getBoolean("message_analysis", false);
        silenceThresholdRuntime = preferences.getInt("silence_threshold", SILENCE_THRESHOLD);
        Log.d(TAG, "Settings loaded: STT=" + sttApiUrl + " Llama=" + (llamaApiUrl.length()>40?llamaApiUrl.substring(0,40):llamaApiUrl) + " telegram_set=" + (!telegramToken.isEmpty()));
    }

    private void saveSettings() {
        preferences.edit()
            .putString("stt_api_url", sttApiUrl)
            .putString("llama_api_url", llamaApiUrl)
            .putString("telegram_token", telegramToken)
            .putString("telegram_chat_id", telegramChatIdLocal)
            .putBoolean("message_analysis", messageAnalysisEnabled)
            .putInt("silence_threshold", silenceThresholdRuntime)
            .apply();
        Log.d(TAG, "Settings saved");
    }
    
    // ==================== API CALLS ====================
    
    /**
     * POST audio data to STT API
     * Returns: transcript text
     */
    private String sendToSTTApi(byte[] audioData) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(sttApiUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "audio/wav");
            connection.setRequestProperty("Content-Length", String.valueOf(audioData.length));
            connection.setConnectTimeout(144000);
            connection.setReadTimeout(144000);
            
            Log.d(TAG, "STT API: Sending " + audioData.length + " bytes to " + STT_API_URL);
            
            // Send audio  
            OutputStream outputStream = connection.getOutputStream();
            outputStream.write(audioData);
            outputStream.flush();
            outputStream.close();
            
            int responseCode = connection.getResponseCode();
            Log.d(TAG, "STT API Response Code: " + responseCode);
            
            if (responseCode == HttpURLConnection.HTTP_OK) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                
                String responseText = response.toString();
                Log.d(TAG, "STT API Raw Response: " + responseText);
                
                // Try to parse JSON response
                try {
                    JSONObject jsonResponse = new JSONObject(responseText);
                    
                    // Check common keys for transcript text
                    String[] possibleKeys = {"text", "transcript", "transcription", "result", "output", "content"};
                    for (String key : possibleKeys) {
                        if (jsonResponse.has(key)) {
                            String value = jsonResponse.optString(key, "");
                            if (!value.isEmpty()) {
                                Log.d(TAG, "STT: Found transcript in key '" + key + "': " + value);
                                return value;
                            }
                        }
                    }
                    
                    // If no known key, search recursively
                    String found = findStringInJson(jsonResponse, "");
                    if (found != null) {
                        Log.d(TAG, "STT: Found text recursively: " + found);
                        return found;
                    }
                    
                } catch (JSONException e) {
                    // Not JSON, return raw text
                    Log.d(TAG, "STT: Response is not JSON, returning raw text");
                    return responseText;
                }
                
                return responseText;
            } else {
                Log.e(TAG, "STT API Error: HTTP " + responseCode);
            }
        } catch (Exception e) {
            Log.e(TAG, "STT API Exception: " + e.getMessage());
            e.printStackTrace();
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
        return null;
    }
    
    /**
     * GET request to Llama API with transcript for scam analysis
     * Returns: raw response text directly
     */
    private String sendToLlamaApiRaw(String transcript) {
        HttpURLConnection connection = null;
        try {
            // Create context prompt for scam detection
            String prompt = "You are an AI model specialized in real-time call conversation analysis.\n\n" +
                "Your task is to analyze phone call conversations between two people and determine whether the call is:\n" +
                "- Normal person-to-person conversation\n" +
                "- Slightly suspicious\n" +
                "- Highly suspicious or fraudulent\n\n" +
                "You must understand both normal and fraudulent conversations accurately.\n" +
                "Do NOT assume fraud unless there are strong indicators.\n\n" +
                "You are analyzing partial chunks of a real-time call, so context may be incomplete.\n" +
                "Be cautious and balanced in judgment. Rules:\n" +
                "1. Normal daily conversations should receive very low scores.\n" +
                "2. Fraud or scam calls should receive high scores.\n" +
                "3. Do not overreact to polite requests or casual discussions.\n" +
                "4. Strong fraud indicators include:\n" +
                "   - Asking for OTP, PIN, CVV, passwords\n" +
                "   - Urgency or pressure tactics\n" +
                "   - Threats or fear-based language\n" +
                "   - Impersonation (bank, police, company)\n" +
                "   - Requests for money transfer or sensitive data\n" +
                "5. The score must be a SINGLE aggregated score from 0 to 100.\n\n" +
                "Score meaning:\n" +
                "- 0–20  : Completely normal conversation\n" +
                "- 21–40 : Normal with minor caution\n" +
                "- 41–60 : Suspicious\n" +
                "- 61–80 : High risk\n" +
                "- 81–100: Very confident fraud. Write a Score on top as -Score-\n" +
                "Conversation:\n" + transcript;
            
            String encodedPrompt = URLEncoder.encode(prompt, "UTF-8");
            String fullUrl = llamaApiUrl + encodedPrompt;
            
            Log.d(TAG, "Llama API: Sending request...");
            Log.d(TAG, "Llama API URL length: " + fullUrl.length());
            
            URL url = new URL(fullUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(252000);
            connection.setReadTimeout(252000);
            
            int responseCode = connection.getResponseCode();
            Log.d(TAG, "Llama API Response Code: " + responseCode);
            
            if (responseCode == HttpURLConnection.HTTP_OK) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                
                String responseText = response.toString().trim();
                Log.d(TAG, "Llama API Raw Response: " + responseText);
                Log.d(TAG, "Response length: " + responseText.length());
                
                return responseText;
                
            } else {
                Log.e(TAG, "Llama API Error: HTTP " + responseCode);
            }
        } catch (Exception e) {
            Log.e(TAG, "Llama API Exception: " + e.getMessage());
            e.printStackTrace();
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
        return "API Error";
    }
    
    /**
     * GET request to Llama API with transcript for scam analysis
     * Returns: score between 0 and 1
     */
    private double sendToLlamaApi(String transcript) {
        HttpURLConnection connection = null;
        try {
            // Create context prompt for scam detection
            String prompt = "You are an AI model specialized in real-time call conversation analysis.\n\n" +
                "Your task is to analyze phone call conversations between two people and determine whether the call is:\n" +
                "- Normal person-to-person conversation\n" +
                "- Slightly suspicious\n" +
                "- Highly suspicious or fraudulent\n\n" +
                "You must understand both normal and fraudulent conversations accurately.\n" +
                "Do NOT assume fraud unless there are strong indicators.\n\n" +
                "You are analyzing partial chunks of a real-time call, so context may be incomplete.\n" +
                "Be cautious and balanced in judgment. Rules:\n" +
                "1. Normal daily conversations should receive very low scores.\n" +
                "2. Fraud or scam calls should receive high scores.\n" +
                "3. Do not overreact to polite requests or casual discussions.\n" +
                "4. Strong fraud indicators include:\n" +
                "   - Asking for OTP, PIN, CVV, passwords\n" +
                "   - Urgency or pressure tactics\n" +
                "   - Threats or fear-based language\n" +
                "   - Impersonation (bank, police, company)\n" +
                "   - Requests for money transfer or sensitive data\n" +
                "5. The score must be a SINGLE aggregated score from 0 to 100.\n\n" +
                "Score meaning:\n" +
                "- 0–20  : Completely normal conversation\n" +
                "- 21–40 : Normal with minor caution\n" +
                "- 41–60 : Suspicious\n" +
                "- 61–80 : High risk\n" +
                "- 81–100: Very confident fraud. Write a Score on top as -Score-\n" +
                "Conversation:\n" + transcript;
            
            String encodedPrompt = URLEncoder.encode(prompt, "UTF-8");
            String fullUrl = llamaApiUrl + encodedPrompt;
            
            Log.d(TAG, "Llama API: Sending request...");
            Log.d(TAG, "Llama API URL length: " + fullUrl.length());
            
            URL url = new URL(fullUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(252000);
            connection.setReadTimeout(252000);
            
            int responseCode = connection.getResponseCode();
            Log.d(TAG, "Llama API Response Code: " + responseCode);
            
            if (responseCode == HttpURLConnection.HTTP_OK) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                
                String responseText = response.toString().trim();
                lastApiResponse = responseText;
                
                Log.d(TAG, "Llama API Raw Response: " + responseText);
                Log.d(TAG, "Response length: " + responseText.length());
                
                // Parse the response to extract score
                double score = parseScoreFromResponse(responseText);
                
                Log.d(TAG, "Parsed Score: " + score);
                return score;
                
            } else {
                Log.e(TAG, "Llama API Error: HTTP " + responseCode);
            }
        } catch (Exception e) {
            Log.e(TAG, "Llama API Exception: " + e.getMessage());
            e.printStackTrace();
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
        return 0.5; // Default neutral score on error
    }
    
    /**
     * Parse score from Llama API response
     * Searches through the entire JSON structure to find a score value
     */
    private double parseScoreFromResponse(String responseText) {
        Log.d(TAG, "=== Parsing score from response ===");
        
        if (responseText == null || responseText.isEmpty()) {
            Log.w(TAG, "Empty response");
            return 0.5;
        }
        
        // Step 1: Try to parse as JSON and look for score field
        try {
            JSONObject json = new JSONObject(responseText);
            Double score = findScoreInJsonObject(json);
            if (score != null) {
                Log.d(TAG, "Found score in JSON: " + score);
                return clampScore(score);
            }
        } catch (JSONException e) {
            Log.d(TAG, "Not a JSON object, trying other methods...");
        }
        
        // Step 2: Try to parse as JSON array
        try {
            JSONArray jsonArray = new JSONArray(responseText);
            for (int i = 0; i < jsonArray.length(); i++) {
                Object item = jsonArray.get(i);
                if (item instanceof JSONObject) {
                    Double score = findScoreInJsonObject((JSONObject) item);
                    if (score != null) {
                        Log.d(TAG, "Found score in JSON array: " + score);
                        return clampScore(score);
                    }
                }
            }
        } catch (JSONException e) {
            Log.d(TAG, "Not a JSON array...");
        }
        
        // Step 3: Extract score from nested JSON string (if the response contains escaped JSON)
        try {
            // Look for JSON within the response string
            int jsonStart = responseText.indexOf("{");
            int jsonEnd = responseText.lastIndexOf("}");
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                String jsonPart = responseText.substring(jsonStart, jsonEnd + 1);
                // Handle escaped quotes
                jsonPart = jsonPart.replace("\\\"", "\"");
                jsonPart = jsonPart.replace("\\n", " ");
                
                Log.d(TAG, "Trying to parse embedded JSON: " + jsonPart);
                
                JSONObject embeddedJson = new JSONObject(jsonPart);
                Double score = findScoreInJsonObject(embeddedJson);
                if (score != null) {
                    Log.d(TAG, "Found score in embedded JSON: " + score);
                    return clampScore(score);
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "No embedded JSON found...");
        }
        
        // Step 4: Use regex to find any number that could be a score
        Double regexScore = extractScoreWithRegex(responseText);
        if (regexScore != null) {
            Log.d(TAG, "Found score via regex: " + regexScore);
            return clampScore(regexScore);
        }
        
        // Step 5: Look for keywords and assign score
        String lowerResponse = responseText.toLowerCase();
        if (lowerResponse.contains("scam") || lowerResponse.contains("fraud") || lowerResponse.contains("danger")) {
            if (lowerResponse.contains("not a scam") || lowerResponse.contains("no scam") || lowerResponse.contains("safe")) {
                Log.d(TAG, "Keywords suggest safe call");
                return 0.2;
            } else {
                Log.d(TAG, "Keywords suggest scam");
                return 0.8;
            }
        } else if (lowerResponse.contains("safe") || lowerResponse.contains("legitimate") || lowerResponse.contains("normal")) {
            Log.d(TAG, "Keywords suggest safe call");
            return 0.2;
        } else if (lowerResponse.contains("suspicious") || lowerResponse.contains("caution") || lowerResponse.contains("warning")) {
            Log.d(TAG, "Keywords suggest caution");
            return 0.5;
        }
        
        Log.w(TAG, "Could not extract score, returning default 0.5");
        return 0.5;
    }
    
    /**
     * Recursively search JSONObject for score field
     */
    private Double findScoreInJsonObject(JSONObject json) {
        // Direct score fields to check
        String[] scoreKeys = {"score", "scam_score", "risk_score", "probability", "risk", 
                              "scam_probability", "threat_score", "danger_score", "result", 
                              "value", "rating", "confidence"};
        
        for (String key : scoreKeys) {
            if (json.has(key)) {
                try {
                    Object value = json.get(key);
                    if (value instanceof Number) {
                        return ((Number) value).doubleValue();
                    } else if (value instanceof String) {
                        String strValue = (String) value;
                        Double parsed = parseNumberFromString(strValue);
                        if (parsed != null) {
                            return parsed;
                        }
                    }
                } catch (JSONException e) {
                    // Continue to next key
                }
            }
        }
        
        // Check for nested objects
        String[] nestedKeys = {"response", "data", "result", "output", "content", "message", "analysis"};
        for (String key : nestedKeys) {
            if (json.has(key)) {
                try {
                    Object value = json.get(key);
                    if (value instanceof JSONObject) {
                        Double nestedScore = findScoreInJsonObject((JSONObject) value);
                        if (nestedScore != null) {
                            return nestedScore;
                        }
                    } else if (value instanceof String) {
                        // Try to parse the string as JSON
                        String strValue = (String) value;
                        try {
                            JSONObject nestedJson = new JSONObject(strValue);
                            Double nestedScore = findScoreInJsonObject(nestedJson);
                            if (nestedScore != null) {
                                return nestedScore;
                            }
                        } catch (JSONException e) {
                            // Not JSON, try to extract number
                            Double parsed = parseNumberFromString(strValue);
                            if (parsed != null) {
                                return parsed;
                            }
                        }
                    }
                } catch (JSONException e) {
                    // Continue
                }
            }
        }
        
        // Iterate through all keys
        Iterator<String> keys = json.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            try {
                Object value = json.get(key);
                if (value instanceof JSONObject) {
                    Double nestedScore = findScoreInJsonObject((JSONObject) value);
                    if (nestedScore != null) {
                        return nestedScore;
                    }
                } else if (value instanceof JSONArray) {
                    JSONArray arr = (JSONArray) value;
                    for (int i = 0; i < arr.length(); i++) {
                        Object item = arr.get(i);
                        if (item instanceof JSONObject) {
                            Double nestedScore = findScoreInJsonObject((JSONObject) item);
                            if (nestedScore != null) {
                                return nestedScore;
                            }
                        }
                    }
                }
            } catch (JSONException e) {
                // Continue
            }
        }
        
        return null;
    }
    
    /**
     * Find string value in JSON (for STT response)
     */
    private String findStringInJson(JSONObject json, String path) {
        Iterator<String> keys = json.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            try {
                Object value = json.get(key);
                if (value instanceof String) {
                    String strValue = (String) value;
                    if (strValue.length() > 10) { // Likely a transcript
                        return strValue;
                    }
                } else if (value instanceof JSONObject) {
                    String found = findStringInJson((JSONObject) value, path + "." + key);
                    if (found != null) {
                        return found;
                    }
                }
            } catch (JSONException e) {
                // Continue
            }
        }
        return null;
    }
    
    /**
     * Parse a number from string, handling various formats
     */
    private Double parseNumberFromString(String text) {
        if (text == null || text.isEmpty()) return null;
        
        // Try direct parse first
        try {
            double value = Double.parseDouble(text.trim());
            return value;
        } catch (NumberFormatException e) {
            // Continue to regex
        }
        
        // Use regex to find number
        return extractScoreWithRegex(text);
    }
    
    /**
     * Extract score using regex patterns
     */
    private Double extractScoreWithRegex(String text) {
        if (text == null || text.isEmpty()) return null;
        
        // Pattern 1: "score": 0.75 or score: 0.75
        Pattern scorePattern = Pattern.compile("(?:\"?score\"?\\s*[:\"]\\s*)([0-9]*\\.?[0-9]+)", Pattern.CASE_INSENSITIVE);
        Matcher scoreMatcher = scorePattern.matcher(text);
        if (scoreMatcher.find()) {
            try {
                return Double.parseDouble(scoreMatcher.group(1));
            } catch (NumberFormatException e) {
                // Continue
            }
        }
        
        // Pattern 2: Percentage like 75% or 0.75
        Pattern percentPattern = Pattern.compile("([0-9]+(?:\\.[0-9]+)?)\\s*%");
        Matcher percentMatcher = percentPattern.matcher(text);
        if (percentMatcher.find()) {
            try {
                double value = Double.parseDouble(percentMatcher.group(1));
                return value / 100.0;
            } catch (NumberFormatException e) {
                // Continue
            }
        }
        
        // Pattern 3: Decimal number between 0 and 1
        Pattern decimalPattern = Pattern.compile("\\b(0\\.[0-9]+|1\\.0|1|0)\\b");
        Matcher decimalMatcher = decimalPattern.matcher(text);
        while (decimalMatcher.find()) {
            try {
                double value = Double.parseDouble(decimalMatcher.group(1));
                if (value >= 0 && value <= 1) {
                    return value;
                }
            } catch (NumberFormatException e) {
                // Continue
            }
        }
        
        // Pattern 4: Any number and normalize
        Pattern anyNumberPattern = Pattern.compile("([0-9]+(?:\\.[0-9]+)?)");
        Matcher anyMatcher = anyNumberPattern.matcher(text);
        while (anyMatcher.find()) {
            try {
                double value = Double.parseDouble(anyMatcher.group(1));
                if (value >= 0 && value <= 1) {
                    return value;
                } else if (value >= 0 && value <= 100) {
                    return value / 100.0;
                }
            } catch (NumberFormatException e) {
                // Continue
            }
        }
        
        return null;
    }
    
    /**
     * Clamp score to valid range [0, 1]
     */
    private double clampScore(double score) {
        if (score < 0) return 0;
        if (score > 1) {
            // If score is > 1 but <= 100, assume it's a percentage
            if (score <= 100) {
                return score / 100.0;
            }
            return 1;
        }
        return score;
    }
    
    // ==================== ADVANCED AUDIO ANALYSIS ====================
    
    /**
     * Complete audio analysis pipeline (like React analyzeAudio function)
     * 1. Read audio file → 2. STT → 3. Fraud Score → 4. Log result
     */
    public class AnalysisResult {
        public String transcript;
        public double score;
        public String rawResponse;
        public long duration;
        public String timestamp;
    }
    
    private AnalysisResult analyzeAudio(Uri audioUri) {
        AnalysisResult result = new AnalysisResult();
        result.timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
        
        try {
            long startTime = System.currentTimeMillis();
            
            // Step 1: Read audio file
            byte[] audioData = readAudioFile(audioUri);
            if (audioData == null || audioData.length == 0) {
                Log.e(TAG, "Failed to read audio file");
                return null;
            }
            
            Log.d(TAG, "Audio file read: " + audioData.length + " bytes");
            
            // Step 2: Convert to WAV and send to STT
            byte[] wavData = convertToWav(audioData);
            result.transcript = sendToSTTApi(wavData);
            
            if (result.transcript == null || result.transcript.isEmpty()) {
                result.transcript = "[No speech detected]";
            }
            
            Log.d(TAG, "STT Result: " + result.transcript);
            
            // Step 3: Send transcript to Fraud AI
            result.score = sendToLlamaApi(result.transcript);
            result.rawResponse = sendToLlamaApiRaw(result.transcript);
            result.duration = System.currentTimeMillis() - startTime;
            
            Log.d(TAG, "Analysis: Score=" + result.score + " Time=" + result.duration + "ms");
            
            // Step 4: Save to logs
            saveAnalysisLog(result);
            
            return result;
            
        } catch (Exception e) {
            Log.e(TAG, "Error in analyzeAudio: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Read audio file from URI into byte array
     */
    private byte[] readAudioFile(Uri uri) {
        try {
            java.io.InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) return null;
            
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[16384];
            int nRead;
            
            while ((nRead = is.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }
            
            is.close();
            return buffer.toByteArray();
            
        } catch (Exception e) {
            Log.e(TAG, "Error reading audio file: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Enhanced logging with JSON storage (like React saveLog)
     */
    private void saveAnalysisLog(AnalysisResult result) {
        try {
            String logsJson = preferences.getString("analysis_logs", "[]");
            JSONArray logs = new JSONArray(logsJson);
            
            JSONObject logEntry = new JSONObject();
            logEntry.put("timestamp", result.timestamp);
            logEntry.put("transcript", result.transcript);
            logEntry.put("score", result.score);
            logEntry.put("rawResponse", result.rawResponse);
            logEntry.put("duration", result.duration);
            
            JSONArray newLogs = new JSONArray();
            newLogs.put(logEntry);
            for (int i = 0; i < logs.length() && i < 99; i++) {
                newLogs.put(logs.get(i));
            }
            
            preferences.edit().putString("analysis_logs", newLogs.toString()).apply();
            Log.d(TAG, "Analysis log saved. Total: " + newLogs.length());
            
        } catch (Exception e) {
            Log.e(TAG, "Error saving analysis log: " + e.getMessage());
        }
    }
    
    /**
     * Get all analysis logs (like React getLogs)
     */
    private List<AnalysisResult> getAnalysisLogs() {
        List<AnalysisResult> results = new ArrayList<>();
        try {
            String logsJson = preferences.getString("analysis_logs", "[]");
            JSONArray logs = new JSONArray(logsJson);
            
            for (int i = 0; i < logs.length(); i++) {
                JSONObject log = logs.getJSONObject(i);
                AnalysisResult result = new AnalysisResult();
                result.timestamp = log.getString("timestamp");
                result.transcript = log.getString("transcript");
                result.score = log.getDouble("score");
                result.rawResponse = log.optString("rawResponse", "");
                result.duration = log.optLong("duration", 0);
                results.add(result);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading analysis logs: " + e.getMessage());
        }
        return results;
    }
    
    /**
     * Start animated waveform during analysis
     */
    private void startWaveformAnimation() {
        mainHandler.post(() -> {
            try {
                if (floatingIndicator != null && isFloatingWindowShowing) {
                    startPulsingAnimation();
                }
            } catch (Exception e) {
                Log.e(TAG, "Waveform animation error: " + e.getMessage());
            }
        });
    }
    
    // ==================== FLOATING WINDOW ====================
    
    private void showFloatingWindow() {
        if (isFloatingWindowShowing) return;
        
        mainHandler.post(() -> {
            try {
                int layoutFlag;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
                } else {
                    layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
                }
                
                // ==================== STT RESPONSE WINDOW (TOP) ====================
                floatingViewStt = new LinearLayout(this);
                floatingViewStt.setOrientation(LinearLayout.VERTICAL);
                floatingViewStt.setPadding(dp(16), dp(12), dp(16), dp(12));
                
                GradientDrawable backgroundStt = new GradientDrawable();
                backgroundStt.setColor(Color.parseColor("#E8F5E9"));
                backgroundStt.setCornerRadius(dp(16));
                backgroundStt.setStroke(dp(2), Color.parseColor("#81C784"));
                floatingViewStt.setBackground(backgroundStt);
                floatingViewStt.setElevation(dp(8));
                
                // STT Header
                LinearLayout topRowStt = new LinearLayout(this);
                topRowStt.setOrientation(LinearLayout.HORIZONTAL);
                topRowStt.setGravity(Gravity.CENTER_VERTICAL);
                
                floatingIndicatorStt = new View(this);
                GradientDrawable indicatorBgStt = new GradientDrawable();
                indicatorBgStt.setShape(GradientDrawable.OVAL);
                indicatorBgStt.setColor(Color.parseColor("#81C784"));
                floatingIndicatorStt.setBackground(indicatorBgStt);
                LinearLayout.LayoutParams indicatorParamsStt = new LinearLayout.LayoutParams(dp(14), dp(14));
                indicatorParamsStt.setMargins(0, 0, dp(10), 0);
                floatingIndicatorStt.setLayoutParams(indicatorParamsStt);
                topRowStt.addView(floatingIndicatorStt);
                
                TextView sttLabel = new TextView(this);
                sttLabel.setText("STT Transcript");
                sttLabel.setTextSize(12);
                sttLabel.setTextColor(Color.parseColor("#2E7D32"));
                sttLabel.setTypeface(null, android.graphics.Typeface.BOLD);
                topRowStt.addView(sttLabel);
                
                floatingViewStt.addView(topRowStt);
                
                // STT Response text
                floatingTranscriptText = new TextView(this);
                floatingTranscriptText.setText("");
                floatingTranscriptText.setTextSize(10);
                floatingTranscriptText.setTextColor(Color.parseColor("#1B5E20"));
                floatingTranscriptText.setMaxLines(8);
                LinearLayout.LayoutParams transcriptParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                );
                transcriptParams.setMargins(0, dp(6), 0, 0);
                floatingTranscriptText.setLayoutParams(transcriptParams);
                floatingViewStt.addView(floatingTranscriptText);
                
                WindowManager.LayoutParams paramsStt = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    layoutFlag,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT
                );
                paramsStt.gravity = Gravity.TOP | Gravity.END;
                paramsStt.x = dp(16);
                paramsStt.y = dp(100);
                
                floatingViewStt.setOnTouchListener(new FloatingWindowTouchListener(paramsStt));
                windowManager.addView(floatingViewStt, paramsStt);
                
                // ==================== LLAMA RESPONSE WINDOW (BOTTOM) ====================
                floatingView = new LinearLayout(this);
                floatingView.setOrientation(LinearLayout.VERTICAL);
                floatingView.setPadding(dp(16), dp(12), dp(16), dp(12));
                
                GradientDrawable background = new GradientDrawable();
                background.setColor(Color.parseColor("#FFF3E0"));
                background.setCornerRadius(dp(16));
                background.setStroke(dp(2), Color.parseColor("#FFB74D"));
                floatingView.setBackground(background);
                floatingView.setElevation(dp(8));
                
                // Llama Header
                LinearLayout topRow = new LinearLayout(this);
                topRow.setOrientation(LinearLayout.HORIZONTAL);
                topRow.setGravity(Gravity.CENTER_VERTICAL);
                
                floatingIndicator = new View(this);
                GradientDrawable indicatorBg = new GradientDrawable();
                indicatorBg.setShape(GradientDrawable.OVAL);
                indicatorBg.setColor(Color.parseColor("#FFB74D"));
                floatingIndicator.setBackground(indicatorBg);
                LinearLayout.LayoutParams indicatorParams = new LinearLayout.LayoutParams(dp(14), dp(14));
                indicatorParams.setMargins(0, 0, dp(10), 0);
                floatingIndicator.setLayoutParams(indicatorParams);
                topRow.addView(floatingIndicator);
                
                floatingStatusText = new TextView(this);
                floatingStatusText.setText("Llama Analysis");
                floatingStatusText.setTextSize(12);
                floatingStatusText.setTextColor(Color.parseColor("#E65100"));
                floatingStatusText.setTypeface(null, android.graphics.Typeface.BOLD);
                topRow.addView(floatingStatusText);
                
                floatingView.addView(topRow);
                
                // Llama Response text
                floatingScoreText = new TextView(this);
                floatingScoreText.setText("");
                floatingScoreText.setTextSize(10);
                floatingScoreText.setTextColor(Color.parseColor("#BF360C"));
                floatingScoreText.setMaxLines(8);
                LinearLayout.LayoutParams responseParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                );
                responseParams.setMargins(0, dp(6), 0, 0);
                floatingScoreText.setLayoutParams(responseParams);
                floatingView.addView(floatingScoreText);
                
                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    layoutFlag,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT
                );
                
                params.gravity = Gravity.TOP | Gravity.END;
                params.x = dp(16);
                params.y = dp(300);
                
                floatingView.setOnTouchListener(new FloatingWindowTouchListener(params));
                windowManager.addView(floatingView, params);
                
                isFloatingWindowShowing = true;
                
                // Start pulsing animations
                startPulsingAnimation();
                
                Log.d(TAG, "Floating windows shown (STT + Llama)");
            } catch (Exception e) {
                Log.e(TAG, "Error showing floating window: " + e.getMessage());
                e.printStackTrace();
            }
        });
    }
    
    private void hideFloatingWindow() {
        mainHandler.post(() -> {
            try {
                // Hide STT window
                if (floatingViewStt != null && isFloatingWindowShowing) {
                    windowManager.removeView(floatingViewStt);
                    floatingViewStt = null;
                }
                
                // Hide Llama window
                if (floatingView != null && isFloatingWindowShowing) {
                    windowManager.removeView(floatingView);
                    floatingView = null;
                    isFloatingWindowShowing = false;
                }
                
                Log.d(TAG, "Floating windows hidden");
            } catch (Exception e) {
                Log.e(TAG, "Error hiding floating window: " + e.getMessage());
            }
        });
    }
    
    private void updateFloatingWindow(String responseText) {
        if (floatingView == null || !isFloatingWindowShowing) return;
        
        try {
            floatingStatusText.setText("Llama Analysis");
            floatingScoreText.setText(responseText);
        } catch (Exception e) {
            Log.e(TAG, "Error updating floating window: " + e.getMessage());
        }
    }
    
    private void updateFloatingWindowWithTranscript(String transcript) {
        if (floatingViewStt == null || !isFloatingWindowShowing) return;
        
        try {
            floatingTranscriptText.setText(transcript);
        } catch (Exception e) {
            Log.e(TAG, "Error updating STT window: " + e.getMessage());
        }
    }
    
    private void updateFloatingWindowWithApiResponse(String apiResponse) {
        Log.d(TAG, "Updating floating window with API response");
        updateFloatingWindow(apiResponse);
    }
    
    private void startPulsingAnimation() {
        // Animate STT indicator
        if (floatingIndicatorStt != null) {
            AlphaAnimation pulse = new AlphaAnimation(1.0f, 0.5f);
            pulse.setDuration(800);
            pulse.setRepeatMode(Animation.REVERSE);
            pulse.setRepeatCount(Animation.INFINITE);
            floatingIndicatorStt.startAnimation(pulse);
        }
        
        // Animate Llama indicator
        if (floatingIndicator != null) {
            AlphaAnimation pulse = new AlphaAnimation(1.0f, 0.5f);
            pulse.setDuration(800);
            pulse.setRepeatMode(Animation.REVERSE);
            pulse.setRepeatCount(Animation.INFINITE);
            floatingIndicator.startAnimation(pulse);
        }
    }
    
    private class FloatingWindowTouchListener implements View.OnTouchListener {
        private WindowManager.LayoutParams params;
        private int initialX, initialY;
        private float initialTouchX, initialTouchY;
        
        FloatingWindowTouchListener(WindowManager.LayoutParams params) {
            this.params = params;
        }
        
        @Override
        public boolean onTouch(View v, MotionEvent event) {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    return true;
                    
                case MotionEvent.ACTION_MOVE:
                    params.x = initialX - (int) (event.getRawX() - initialTouchX);
                    params.y = initialY + (int) (event.getRawY() - initialTouchY);
                    windowManager.updateViewLayout(floatingView, params);
                    return true;
            }
            return false;
        }
    }
    
    // ==================== DATA PERSISTENCE ====================
    
    private void saveCallRecord() {
        try {
            CallRecord record = new CallRecord();
            record.timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
            record.phoneNumber = currentPhoneNumber;
            record.score = currentScore;
            record.transcript = lastTranscript;
            
            callHistory.add(0, record);
            
            // Keep only last 50 records
            while (callHistory.size() > 50) {
                callHistory.remove(callHistory.size() - 1);
            }
            
            // Save to SharedPreferences
            StringBuilder sb = new StringBuilder();
            for (CallRecord r : callHistory) {
                sb.append(r.timestamp).append("|")
                  .append(r.phoneNumber).append("|")
                  .append(r.score).append("|")
                  .append(r.transcript.replace("|", " ").replace("\n", " ")).append("\n");
            }
            preferences.edit().putString("call_history", sb.toString()).apply();
            
            Log.d(TAG, "Call record saved: " + currentPhoneNumber + " - Score: " + currentScore);
        } catch (Exception e) {
            Log.e(TAG, "Error saving call record: " + e.getMessage());
        }
    }
    
    private void loadCallHistory() {
        try {
            String historyData = preferences.getString("call_history", "");
            if (!historyData.isEmpty()) {
                String[] lines = historyData.split("\n");
                for (String line : lines) {
                    if (!line.isEmpty()) {
                        String[] parts = line.split("\\|", 4);
                        if (parts.length >= 3) {
                            CallRecord record = new CallRecord();
                            record.timestamp = parts[0];
                            record.phoneNumber = parts[1];
                            record.score = Double.parseDouble(parts[2]);
                            record.transcript = parts.length > 3 ? parts[3] : "";
                            callHistory.add(record);
                        }
                    }
                }
            }
            Log.d(TAG, "Loaded " + callHistory.size() + " call records");
        } catch (Exception e) {
            Log.e(TAG, "Error loading call history: " + e.getMessage());
        }
    }
    
    private void updateLastCallInfo() {
        if (callHistory.isEmpty()) {
            lastCallInfo.setText("No calls analyzed yet");
            return;
        }
        
        CallRecord last = callHistory.get(0);
        String statusLabel;
        int statusColor;
        
        if (last.score < 0.3) {
            statusLabel = "Safe";
            statusColor = Color.parseColor("#10B981");
        } else if (last.score < 0.6) {
            statusLabel = "Caution";
            statusColor = Color.parseColor("#F59E0B");
        } else {
            statusLabel = "Danger";
            statusColor = Color.parseColor("#EF4444");
        }
        
        String info = String.format(Locale.US, 
            "Number: %s\nTime: %s\nRisk Score: %.0f%% (%s)\nTranscript: %s",
            last.phoneNumber,
            last.timestamp,
            last.score * 100,
            statusLabel,
            last.transcript.length() > 80 ? last.transcript.substring(0, 80) + "..." : last.transcript
        );
        
        lastCallInfo.setText(info);
    }
    
    // ==================== NOTIFICATION ====================
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Call Guard Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Monitors calls for scam detection");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    // ==================== CALL RECORD CLASS ====================
    
    private static class CallRecord {
        String timestamp;
        String phoneNumber;
        double score;
        String transcript;
    }
    
    // ==================== LIFECYCLE ====================
    
    @Override
    protected void onDestroy() {
        super.onDestroy();
        
        // Stop monitoring
        if (telephonyManager != null && phoneStateListener != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
        }
        
        // Stop recording
        stopAudioRecording();
        
        // Hide floating window
        hideFloatingWindow();
        
        // Shutdown executor
        if (executorService != null) {
            executorService.shutdown();
        }
        
        Log.d(TAG, "MainActivity destroyed");
    }
    
    @Override
    protected void onResume() {
        super.onResume();
        if (allPermissionsGranted) {
            statusText.setText("Active & Protecting");
            statusText.setTextColor(Color.parseColor("#10B981"));
        }
    }
}
