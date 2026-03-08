package com.callguard.ai;

import android.Manifest;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.widget.Button;
import android.widget.TextView;
import android.widget.LinearLayout;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private static final String TAG = "CallGuardAI";

    // â”€â”€ Dark Premium Theme â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    static final int CLR_BG        = Color.parseColor("#0A0E1A");
    static final int CLR_SURFACE   = Color.parseColor("#111827");
    static final int CLR_SURFACE2  = Color.parseColor("#1E2533");
    static final int CLR_BORDER    = Color.parseColor("#2D3748");
    static final int CLR_TEXT      = Color.parseColor("#F0F4FF");
    static final int CLR_TEXT2     = Color.parseColor("#8892A4");
    static final int CLR_PRIMARY   = Color.parseColor("#4F8EF7");
    static final int CLR_PRIMARY2  = Color.parseColor("#7C3AED");
    static final int CLR_SAFE      = Color.parseColor("#10B981");
    static final int CLR_WARN      = Color.parseColor("#F59E0B");
    static final int CLR_DANGER    = Color.parseColor("#EF4444");
    static final int CLR_ORB_BLUE  = Color.parseColor("#2563EB");
    static final int CLR_ORB_GLOW  = Color.parseColor("#60A5FA");
    static final int CLR_FLOAT_BG  = Color.parseColor("#111827");

    // â”€â”€ Audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private static final int SAMPLE_RATE   = 16000;
    private static final int CHANNEL_CFG  = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FMT    = AudioFormat.ENCODING_PCM_16BIT;
    private static final int CHUNK_MS     = 6000;
    private static final int[] SOURCES    = {
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        MediaRecorder.AudioSource.VOICE_CALL,
        MediaRecorder.AudioSource.MIC,
        MediaRecorder.AudioSource.VOICE_RECOGNITION
    };

    private static final String STT_URL   = "https://stt.apkadadyy.workers.dev/";
    private static final String LLM_URL   = "https://llama.apkadadyy.workers.dev/?q=";
    private static final int    REQ_PERMS  = 100;
    private static final int    REQ_OVR    = 101;

    // â”€â”€ UI State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private FrameLayout root;
    private LinearLayout container;
    private int currentTab = 0;
    private TextView headerStatus;

    // AI Orb (AssistiveTouch style)
    private FrameLayout orbContainer;
    private View        orbCore;
    private View        orbRing1, orbRing2;
    private LinearLayout orbMenu;
    private boolean     orbExpanded = false;
    private float       orbX, orbY;
    private float       orbDX, orbDY;

    // Home Tab views
    private TextView    transcriptText;
    private TextView    riskScoreText;
    private TextView    riskLabel;
    private LinearLayout keywordBox;
    private RadarView   radarView;
    private WaveView    waveView;

    // Settings
    private String sttUrl, llmUrl;
    private int    silenceThreshold;
    private boolean autoSpeaker = true;
    private boolean showFloatOnCall = true;

    // Floating Overlay (Truecaller style)
    private WindowManager  wm;
    private FrameLayout    floatRoot;
    private TextView       floatName, floatScore, floatLabel;
    private View           floatPulse;
    private boolean        floatShown = false;
    private float          flX, flY, flDX, flDY;
    private boolean        floatExpanded = false;
    private LinearLayout   floatDetail;

    // Recording
    private AudioRecord    recorder;
    private Thread         recordThread;
    private volatile boolean recording = false;
    private int            chunkNo = 0;

    // Core
    private Handler        main;
    private ExecutorService exec;
    private SharedPreferences prefs;
    private AudioManager   audioMan;
    private TelephonyManager telephony;
    private PhoneStateListener phoneListener;
    private BroadcastReceiver outgoingRcv;
    private boolean        permsOk = false;
    private boolean        callActive = false;
    private String         currentNumber = "";
    // ===== Audio Analysis Feature =====
private LinearLayout uploadCard;
private TextView uploadTitle;
private TextView uploadDesc;
private Button uploadBtn;
private TextView resultText;

static final int PICKAUDIO = 9001;

    // History
    private final List<CallRecord> history = new ArrayList<>();

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // onCreate
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        getWindow().setStatusBarColor(CLR_BG);
        getWindow().setNavigationBarColor(CLR_BG);
        main    = new Handler(Looper.getMainLooper());
        exec    = Executors.newFixedThreadPool(4);
        prefs   = getSharedPreferences("cg_prefs", MODE_PRIVATE);
        wm      = (WindowManager) getSystemService(WINDOW_SERVICE);
        audioMan= (AudioManager)  getSystemService(AUDIO_SERVICE);
        loadSettings();
        loadHistory();
        createNotificationChannel();
        buildUI();
        checkPermissions();
        createUploadAudioCard();
    }
    
    private void createUploadAudioCard() {
    uploadCard = new LinearLayout(this);
    uploadCard.setOrientation(LinearLayout.VERTICAL);
    uploadCard.setPadding(dp(40), dp(40), dp(40), dp(40));
    
    uploadTitle = new TextView(this);
    uploadTitle.setText("Analyze Audio Recording");
    uploadTitle.setTextSize(16);
    uploadTitle.setTextColor(Color.parseColor("#F0F4FF"));
    uploadTitle.setTypeface(Typeface.DEFAULT_BOLD);
    uploadCard.addView(uploadTitle);
    
    uploadDesc = new TextView(this);
    uploadDesc.setText("Upload suspicious call recording to detect scam");
    uploadDesc.setTextSize(13);
    uploadDesc.setTextColor(Color.parseColor("#8892A4"));
    uploadDesc.setPadding(0, 0, 0, dp(16));
    uploadCard.addView(uploadDesc);
    
    uploadBtn = new Button(this);
    uploadBtn.setText("Upload Audio");
    GradientDrawable btnBg = new GradientDrawable();
    btnBg.setColor(Color.parseColor("#4F8EF7"));
    btnBg.setCornerRadius(dp(12));
    uploadBtn.setBackground(btnBg);
    uploadBtn.setTextColor(Color.WHITE);
    uploadBtn.setOnClickListener(v -> pickAudio());
    uploadCard.addView(uploadBtn);
    
    resultText = new TextView(this);
    resultText.setText("Select audio file to analyze");
    resultText.setTextSize(14);
    resultText.setTextColor(Color.parseColor("#8892A4"));
    resultText.setPadding(0, dp(16), 0, 0);
    uploadCard.addView(resultText);
    
    ViewGroup content = (ViewGroup) findViewById(android.R.id.content);
    content.addView(uploadCard);
}


private void pickAudio() {
    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
    intent.setType("audio/*");
    startActivityForResult(Intent.createChooser(intent, "Select Audio"), 9001);
    }

private void uploadAudioToServer(Uri uri){

    new Thread(() -> {

        try{

            java.net.URL url = new java.net.URL("https://yourserver.com/analyze-audio");

            java.net.HttpURLConnection conn =
                    (java.net.HttpURLConnection) url.openConnection();

            conn.setDoOutput(true);
            conn.setRequestMethod("POST");

            java.io.OutputStream os = conn.getOutputStream();
            java.io.InputStream is = getContentResolver().openInputStream(uri);

            byte[] buffer = new byte[4096];
            int len;

            while((len = is.read(buffer)) != -1){
                os.write(buffer,0,len);
            }

            os.flush();
            os.close();

            java.io.BufferedReader reader =
                    new java.io.BufferedReader(
                            new java.io.InputStreamReader(conn.getInputStream())
                    );

            StringBuilder response = new StringBuilder();
            String line;

            while((line = reader.readLine()) != null){
                response.append(line);
            }

            runOnUiThread(() -> showResult(response.toString()));

        }catch(Exception e){

            runOnUiThread(() ->
                    resultText.setText("Error analyzing audio")
            );

        }

    }).start();

}

private void analyzeAudio(Uri audioUri) {
    exec.execute(() -> {
        try {
            // Step 1: STT
            resultText.post(() -> resultText.setText("Uploading to STT..."));
            URL sttUrlObj = new URL("https://stt.apkadadyy.workers.dev");
            HttpURLConnection sttConn = (HttpURLConnection) sttUrlObj.openConnection();
            sttConn.setRequestMethod("POST");
            sttConn.setDoOutput(true);
            sttConn.setRequestProperty("Content-Type", "audio/wav"); // Adjust mime if needed
            
            OutputStream os = sttConn.getOutputStream();
            InputStream is = getContentResolver().openInputStream(audioUri);
            byte[] buffer = new byte[4096];
            int len;
            while ((len = is.read(buffer)) != -1) {
                os.write(buffer, 0, len);
            }
            os.flush();
            os.close();
            is.close();
            
            BufferedReader reader = new BufferedReader(new InputStreamReader(sttConn.getInputStream()));
            StringBuilder sttResponse = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sttResponse.append(line);
            }
            reader.close();
            
            JSONObject sttJson = new JSONObject(sttResponse.toString());
            String transcript = sttJson.getString("text");
            
            resultText.post(() -> resultText.setText("Transcript: " + transcript));
            
            // Step 2: LLM
            String prompt = "You are an AI model specialized in real-time call conversation analysis. Your task is to analyze phone call conversations between two people and determine whether the call is: - Normal person-to-person conversation - Slightly suspicious - Highly suspicious or fraudulent You must understand both normal and fraudulent conversations accurately. Do NOT assume fraud unless there are strong indicators. You are analyzing partial chunks of a real-time call, so context may be incomplete. Be cautious and balanced in judgment. Rules: 1. Normal daily conversations should receive very low scores. 2. Fraud or scam calls should receive high scores. 3. Do not overreact to polite requests or casual discussions. 4. Strong fraud indicators include: - Asking for OTP, PIN, CVV, passwords - Urgency or pressure tactics - Threats or fear-based language - Impersonation (bank, police, company) - Requests for money transfer or sensitive data 5. The score must be a SINGLE aggregated score from 0 to 100. Score meaning: - 0–20 : Completely normal conversation - 21–40 : Normal with minor caution - 41–60 : Suspicious - 61–80 : High risk - 81–100: Very confident fraud. Write a Score on top as -Score- This is a partial transcript of a real-time phone call between two people. Analyze the conversation carefully. Remember: - This is a real-time call chunk. - Judge calmly. Conversation: " + transcript + ". Return JSON: {\"score\":0-100, \"risk\":\"low/medium/high\", \"reason\":\"...\"}";             
            URL llamaUrlObj = new URL("https://llama.apkadadyy.workers.dev/?q=" + URLEncoder.encode(prompt, "UTF-8"));
            HttpURLConnection llamaConn = (HttpURLConnection) llamaUrlObj.openConnection();
            llamaConn.setRequestMethod("GET"); // Simplified GET for Workers.dev
            llamaConn.setDoOutput(false);
            
            BufferedReader llamaReader = new BufferedReader(new InputStreamReader(llamaConn.getInputStream()));
            StringBuilder llamaResponse = new StringBuilder();
            while ((line = llamaReader.readLine()) != null) {
                llamaResponse.append(line);
            }
            llamaReader.close();
            
            JSONObject result = new JSONObject(llamaResponse.toString());
            int score = result.getInt("score");
            String risk = result.getString("risk");
            String reason = result.getString("reason");
            
            resultText.post(() -> resultText.setText("SCAM SCORE: " + score + " | RISK: " + risk + " | REASON: " + reason));
            
        } catch (Exception e) {
            resultText.post(() -> resultText.setText("Error: " + e.getMessage()));
            Log.e(TAG, "Analyze error", e);
        }
    });
}

private void showResult(String json){

    try{

        org.json.JSONObject obj = new org.json.JSONObject(json);

        int score = obj.getInt("score");
        String risk = obj.getString("risk");
        String reason = obj.getString("reason");

        resultText.setText(
                "Risk Score: " + score + "%\n" +
                "Level: " + risk + "\n\n" +
                reason
        );

    }catch(Exception e){

        resultText.setText("Invalid response");

    }

}


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Build Main UI
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void buildUI() {
        root = new FrameLayout(this);
        root.setBackgroundColor(CLR_BG);
        setContentView(root);

        // Main page
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(CLR_BG);

        // Header Bar
        page.addView(buildHeader());

        // Content area
        container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams cLp = new LinearLayout.LayoutParams(-1, 0);
        cLp.weight = 1f;
        container.setLayoutParams(cLp);
        page.addView(container);

        root.addView(page);

        // AI Orb overlay
        orbContainer = new FrameLayout(this);
        root.addView(orbContainer, new FrameLayout.LayoutParams(-1, -1));
        buildAIOrb();
main.post(() -> pulseOrb());  // ← REPLACE pulseOrb(); with this
switchTab(0);
    }

    private LinearLayout buildHeader() {
        LinearLayout h = new LinearLayout(this);
        h.setOrientation(LinearLayout.VERTICAL);
        h.setBackgroundColor(CLR_SURFACE);
        h.setPadding(dp(20), dp(44), dp(20), dp(16));

        // Top row
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        // Shield icon circle
        TextView shield = new TextView(this);
        shield.setText("Ai");
        shield.setTextSize(22);
        shield.setGravity(Gravity.CENTER);
        GradientDrawable sd = new GradientDrawable();
        sd.setShape(GradientDrawable.OVAL);
        sd.setColor(Color.parseColor("#1E3A5F"));
        shield.setBackground(sd);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(dp(48), dp(48));
        slp.rightMargin = dp(12);
        shield.setLayoutParams(slp);
        row.addView(shield);

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, -2);
        tlp.weight = 1f;
        titles.setLayoutParams(tlp);

        TextView tTitle = new TextView(this);
        tTitle.setText("Call Guard AI");
        tTitle.setTextSize(19);
        tTitle.setTypeface(Typeface.DEFAULT_BOLD);
        tTitle.setTextColor(CLR_TEXT);
        titles.addView(tTitle);

        headerStatus = new TextView(this);
        headerStatus.setText("Initializing...");
        headerStatus.setTextSize(12);
        headerStatus.setTextColor(CLR_TEXT2);
        titles.addView(headerStatus);

        row.addView(titles);

        // Status badge
        TextView badge = new TextView(this);
        badge.setText("PRO");
        badge.setTextSize(10);
        badge.setTextColor(Color.WHITE);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setPadding(dp(8), dp(4), dp(8), dp(4));
        GradientDrawable bdg = new GradientDrawable();
        bdg.setColor(Color.parseColor("#7C3AED"));
        bdg.setCornerRadius(dp(20));
        badge.setBackground(bdg);
        row.addView(badge);

        h.addView(row);

        // Tab row (pill style, no bottom navbar)
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setBackgroundColor(CLR_SURFACE2);
        GradientDrawable tabBg = new GradientDrawable();
        tabBg.setColor(CLR_SURFACE2);
        tabBg.setCornerRadius(dp(12));
        tabs.setBackground(tabBg);
        tabs.setPadding(dp(4), dp(4), dp(4), dp(4));
        LinearLayout.LayoutParams tbLp = new LinearLayout.LayoutParams(-1, dp(48));
        tbLp.topMargin = dp(16);
        tabs.setLayoutParams(tbLp);

        String[] tabNames = {" Live", "“ History", " Settings"};
        for (int i = 0; i < tabNames.length; i++) {
            final int idx = i;
            TextView t = new TextView(this);
            t.setText(tabNames[i]);
            t.setGravity(Gravity.CENTER);
            t.setTextSize(13);
            t.setTypeface(Typeface.DEFAULT_BOLD);
            t.setTextColor(i == 0 ? Color.WHITE : CLR_TEXT2);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1);
            lp.weight = 1f;
            t.setLayoutParams(lp);
            if (i == 0) {
                GradientDrawable sel = new GradientDrawable();
                sel.setColor(CLR_PRIMARY);
                sel.setCornerRadius(dp(10));
                t.setBackground(sel);
            }
            t.setOnClickListener(v -> {
                for (int j = 0; j < tabs.getChildCount(); j++) {
                    TextView tj = (TextView) tabs.getChildAt(j);
                    tj.setTextColor(CLR_TEXT2);
                    tj.setBackground(null);
                }
                GradientDrawable sel = new GradientDrawable();
                sel.setColor(CLR_PRIMARY);
                sel.setCornerRadius(dp(10));
                t.setBackground(sel);
                t.setTextColor(Color.WHITE);
                switchTab(idx);
            });
            tabs.addView(t);
        }
        h.addView(tabs);
        return h;
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // AI ORB - Apple AssistiveTouch Style
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   private void buildAIOrb() {
    int orbSz = dp(62);

    orbRing2 = new View(this);
    GradientDrawable r2 = new GradientDrawable();
    r2.setShape(GradientDrawable.OVAL);
    r2.setColor(Color.parseColor("#1A2563EB"));
    orbRing2.setBackground(r2);
    FrameLayout.LayoutParams r2lp = new FrameLayout.LayoutParams(dp(90), dp(90));
    r2lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    r2lp.bottomMargin = dp(28);
    orbContainer.addView(orbRing2, r2lp);

    orbRing1 = new View(this);
    GradientDrawable r1 = new GradientDrawable();
    r1.setShape(GradientDrawable.OVAL);
    r1.setColor(Color.parseColor("#332563EB"));
    orbRing1.setBackground(r1);
    FrameLayout.LayoutParams r1lp = new FrameLayout.LayoutParams(dp(76), dp(76));
    r1lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    r1lp.bottomMargin = dp(35);
    orbContainer.addView(orbRing1, r1lp);

    orbCore = new OrbView(this);
    FrameLayout.LayoutParams olp = new FrameLayout.LayoutParams(orbSz, orbSz);
    olp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    olp.bottomMargin = dp(42);
    orbContainer.addView(orbCore, olp);

    orbMenu = new LinearLayout(this);
    orbMenu.setOrientation(LinearLayout.VERTICAL);
    orbMenu.setAlpha(0f);
    orbMenu.setVisibility(View.INVISIBLE);
    orbMenu.setPadding(dp(8), dp(8), dp(8), dp(8));

    GradientDrawable mbg = new GradientDrawable();
    mbg.setColor(Color.parseColor("#E6111827"));
    mbg.setCornerRadius(dp(20));
    mbg.setStroke(dp(1), CLR_BORDER);
    orbMenu.setBackground(mbg);

    FrameLayout.LayoutParams mlp = new FrameLayout.LayoutParams(dp(220), -2);
    mlp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    mlp.bottomMargin = dp(118);
    orbContainer.addView(orbMenu, mlp);

    addMenuRow(orbMenu, "", "Protection Status", () -> switchTab(0));
    addMenuRow(orbMenu, "", "Call History", () -> switchTab(1));
    addMenuRow(orbMenu, "", "Settings", () -> switchTab(2));
    addMenuRow(orbMenu, "", "Test Mic", this::testMic);

    setupOrbDrag();
}

 private void pulseOrb() {
    if (orbRing1 == null || orbRing2 == null) return;

    ValueAnimator pulse = ValueAnimator.ofFloat(1f, 1.12f, 1f);
    pulse.setDuration(2200);
    pulse.setRepeatCount(ValueAnimator.INFINITE);
    pulse.addUpdateListener(a -> {
        float s = (float) a.getAnimatedValue();
        if (orbRing1 != null) {
            orbRing1.setScaleX(s);
            orbRing1.setScaleY(s);
        }
    });
    pulse.start();

    ValueAnimator pulse2 = ValueAnimator.ofFloat(1f, 1.18f, 1f);
    pulse2.setDuration(2200);
    pulse2.setStartDelay(400);
    pulse2.setRepeatCount(ValueAnimator.INFINITE);
    pulse2.addUpdateListener(a -> {
        float s = (float) a.getAnimatedValue();
        if (orbRing2 != null) {
            orbRing2.setScaleX(s);
            orbRing2.setScaleY(s);
        }
    });
    pulse2.start();
}

    private void addMenuRow(LinearLayout menu, String icon, String label, Runnable action) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(12), dp(12), dp(12));
        GradientDrawable rowBg = new GradientDrawable();
        rowBg.setColor(Color.TRANSPARENT);
        rowBg.setCornerRadius(dp(12));
        row.setBackground(rowBg);

        TextView ic = new TextView(this);
        ic.setText(icon);
        ic.setTextSize(18);
        ic.setGravity(Gravity.CENTER);
        GradientDrawable icBg = new GradientDrawable();
        icBg.setShape(GradientDrawable.OVAL);
        icBg.setColor(CLR_SURFACE2);
        ic.setBackground(icBg);
        LinearLayout.LayoutParams iLp = new LinearLayout.LayoutParams(dp(38), dp(38));
        iLp.rightMargin = dp(12);
        ic.setLayoutParams(iLp);
        row.addView(ic);

        TextView lb = new TextView(this);
        lb.setText(label);
        lb.setTextSize(14);
        lb.setTextColor(CLR_TEXT);
        lb.setTypeface(Typeface.DEFAULT_BOLD);
        row.addView(lb);

        row.setOnClickListener(v -> {
            action.run();
            collapseOrb();
        });
        row.setOnTouchListener((v, e) -> {
            if (e.getAction() == MotionEvent.ACTION_DOWN) rowBg.setColor(CLR_SURFACE2);
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) rowBg.setColor(Color.TRANSPARENT);
            return false;
        });
        menu.addView(row);

        // Divider
        if (menu.getChildCount() < 4) {
            View div = new View(this);
            div.setBackgroundColor(CLR_BORDER);
            menu.addView(div, new LinearLayout.LayoutParams(-1, dp(1)));
        }
    }

    private void setupOrbDrag() {
        int screenW = getResources().getDisplayMetrics().widthPixels;
        final float[] lastX = {0}, lastY = {0};
        final boolean[] hasMoved = {false};

        orbCore.setOnTouchListener((v, e) -> {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    orbDX = orbCore.getX() - e.getRawX();
                    orbDY = orbCore.getY() - e.getRawY();
                    lastX[0] = e.getRawX();
                    lastY[0] = e.getRawY();
                    hasMoved[0] = false;
                    break;
                case MotionEvent.ACTION_MOVE:
                    float nx = e.getRawX() + orbDX;
                    float ny = e.getRawY() + orbDY;
                    if (Math.abs(e.getRawX() - lastX[0]) > 8 || Math.abs(e.getRawY() - lastY[0]) > 8) {
                        hasMoved[0] = true;
                        collapseOrb();
                    }
                    orbCore.setX(nx); orbCore.setY(ny);
                    orbRing1.setX(nx - dp(7)); orbRing1.setY(ny - dp(7));
                    orbRing2.setX(nx - dp(14)); orbRing2.setY(ny - dp(14));
                    break;
                case MotionEvent.ACTION_UP:
                    if (!hasMoved[0]) {
                        toggleOrb();
                    } else {
                        snapOrbToEdge();
                    }
                    break;
            }
            return true;
        });
    }

    private void snapOrbToEdge() {
        int screenW = getResources().getDisplayMetrics().widthPixels;
        float cx = orbCore.getX() + dp(31);
        float targetX = cx < screenW / 2f ? dp(12) : screenW - dp(74);
        ObjectAnimator ax = ObjectAnimator.ofFloat(orbCore, "x", orbCore.getX(), targetX);
        ax.setDuration(300);
        ax.setInterpolator(new OvershootInterpolator(1.2f));
        ax.start();
    }

    private void toggleOrb() {
        if (orbExpanded) collapseOrb(); else expandOrb();
    }

    private void expandOrb() {
        orbExpanded = true;
        orbMenu.setVisibility(View.VISIBLE);
        ObjectAnimator alphaAnim = ObjectAnimator.ofFloat(orbMenu, "alpha", 0f, 1f);
        ObjectAnimator scaleX = ObjectAnimator.ofFloat(orbMenu, "scaleX", 0.8f, 1f);
        ObjectAnimator scaleY = ObjectAnimator.ofFloat(orbMenu, "scaleY", 0.8f, 1f);
        ObjectAnimator coreScale = ObjectAnimator.ofFloat(orbCore, "scaleX", 1f, 1.15f);
        ObjectAnimator coreScaleY = ObjectAnimator.ofFloat(orbCore, "scaleY", 1f, 1.15f);
        AnimatorSet set = new AnimatorSet();
        set.playTogether(alphaAnim, scaleX, scaleY, coreScale, coreScaleY);
        set.setDuration(260);
        set.setInterpolator(new OvershootInterpolator(1.5f));
        set.start();
    }

    private void collapseOrb() {
        orbExpanded = false;
        ObjectAnimator alphaAnim = ObjectAnimator.ofFloat(orbMenu, "alpha", 1f, 0f);
        ObjectAnimator coreScale = ObjectAnimator.ofFloat(orbCore, "scaleX", orbCore.getScaleX(), 1f);
        ObjectAnimator coreScaleY = ObjectAnimator.ofFloat(orbCore, "scaleY", orbCore.getScaleY(), 1f);
        AnimatorSet set = new AnimatorSet();
        set.playTogether(alphaAnim, coreScale, coreScaleY);
        set.setDuration(200);
        set.addListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator a) { orbMenu.setVisibility(View.INVISIBLE); }
        });
        set.start();
    }

    

    // Custom OrbView with animated gradient
    class OrbView extends View {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float angle = 0;
        ValueAnimator rotAnim;

        OrbView(Context c) {
            super(c);
            rotAnim = ValueAnimator.ofFloat(0f, 360f);
            rotAnim.setDuration(3000);
            rotAnim.setRepeatCount(ValueAnimator.INFINITE);
            rotAnim.addUpdateListener(a -> { angle = (float) a.getAnimatedValue(); invalidate(); });
            rotAnim.start();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            int cx = getWidth() / 2, cy = getHeight() / 2, r = Math.min(cx, cy) - dp(2);
            // Outer glow
            p.setColor(Color.parseColor("#4060A5FA"));
            canvas.drawCircle(cx, cy, r + dp(4), p);
            // Main orb gradient
            p.setShader(new RadialGradient(cx, cy, r, new int[]{
                Color.parseColor("#60A5FA"), Color.parseColor("#2563EB"), Color.parseColor("#1E40AF")
            }, null, Shader.TileMode.CLAMP));
            canvas.drawCircle(cx, cy, r, p);
            p.setShader(null);
            // Shine
            p.setColor(Color.parseColor("#40FFFFFF"));
            canvas.drawCircle(cx - r / 4, cy - r / 3, r / 3, p);
            // AI text
            p.setColor(Color.WHITE);
            p.setTextAlign(Paint.Align.CENTER);
            p.setTextSize(dp(13));
            p.setFakeBoldText(true);
            canvas.drawText("AI", cx, cy + dp(5), p);
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // TABS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void switchTab(int idx) {
        currentTab = idx;
        container.removeAllViews();
        if (idx == 0) showLiveTab();
        else if (idx == 1) showHistoryTab();
        else showSettingsTab();
    }

    // â”€â”€ Live Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void showLiveTab() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(CLR_BG);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(16), dp(16), dp(120));

        // Status hero card
        LinearLayout heroCard = mkCard();
        heroCard.setGravity(Gravity.CENTER);

        // Animated status dot
        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusRow.setGravity(Gravity.CENTER);
        statusRow.setPadding(0, 0, 0, dp(8));
        View dot = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setShape(GradientDrawable.OVAL);
        dotBg.setColor(CLR_SAFE);
        dot.setBackground(dotBg);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(dp(10), dp(10));
        dlp.rightMargin = dp(8);
        dlp.gravity = Gravity.CENTER_VERTICAL;
        dot.setLayoutParams(dlp);
        statusRow.addView(dot);
        TextView statusTv = new TextView(this);
        statusTv.setText(permsOk ? "PROTECTION ACTIVE" : "PERMISSIONS NEEDED");
        statusTv.setTextSize(11);
        statusTv.setTextColor(permsOk ? CLR_SAFE : CLR_WARN);
        statusTv.setTypeface(Typeface.DEFAULT_BOLD);
        statusTv.setLetterSpacing(0.12f);
        statusRow.addView(statusTv);
        heroCard.addView(statusRow);

        // Risk score display
        riskScoreText = new TextView(this);
        riskScoreText.setText("0%");
        riskScoreText.setTextSize(64);
        riskScoreText.setTypeface(Typeface.DEFAULT_BOLD);
        riskScoreText.setTextColor(CLR_SAFE);
        riskScoreText.setGravity(Gravity.CENTER);
        heroCard.addView(riskScoreText);

        riskLabel = new TextView(this);
        riskLabel.setText("SAFE");
        riskLabel.setTextSize(14);
        riskLabel.setTypeface(Typeface.DEFAULT_BOLD);
        riskLabel.setTextColor(CLR_SAFE);
        riskLabel.setGravity(Gravity.CENTER);
        riskLabel.setLetterSpacing(0.15f);
        heroCard.addView(riskLabel);

        // keyword chips row
        keywordBox = new LinearLayout(this);
        keywordBox.setOrientation(LinearLayout.HORIZONTAL);
        keywordBox.setPadding(0, dp(12), 0, 0);
        HorizontalScrollView ksv = new HorizontalScrollView(this);
        ksv.addView(keywordBox);
        heroCard.addView(ksv);

        content.addView(heroCard);

        // NASA Radar
        LinearLayout radarCard = mkCard();
        LinearLayout radarHeader = new LinearLayout(this);
        radarHeader.setOrientation(LinearLayout.HORIZONTAL);
        radarHeader.setGravity(Gravity.CENTER_VERTICAL);
        radarHeader.setPadding(0, 0, 0, dp(12));
        TextView radarTitle = mkLabel("THREAT RADAR", 12, CLR_TEXT2);
        radarTitle.setLetterSpacing(0.15f);
        radarTitle.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams rtLp = new LinearLayout.LayoutParams(0, -2);
        rtLp.weight = 1f;
        radarTitle.setLayoutParams(rtLp);
        radarHeader.addView(radarTitle);
        TextView radarBadge = mkLabel("LIVE", 10, Color.WHITE);
        radarBadge.setPadding(dp(8), dp(3), dp(8), dp(3));
        GradientDrawable rbb = new GradientDrawable();
        rbb.setColor(CLR_DANGER);
        rbb.setCornerRadius(dp(20));
        radarBadge.setBackground(rbb);
        radarHeader.addView(radarBadge);
        radarCard.addView(radarHeader);

        radarView = new RadarView(this);
        radarCard.addView(radarView, new LinearLayout.LayoutParams(-1, dp(240)));

        content.addView(radarCard);

        // Waveform
        LinearLayout waveCard = mkCard();
        waveCard.addView(mkLabel("VOICE ANALYSIS", 11, CLR_TEXT2));
        waveView = new WaveView(this);
        waveCard.addView(waveView, new LinearLayout.LayoutParams(-1, dp(72)));
        content.addView(waveCard);

        // Transcript
        LinearLayout transcriptCard = mkCard();
        transcriptCard.addView(mkBoldLabel("Live Transcript", 15));
        transcriptText = new TextView(this);
        transcriptText.setText("Waiting for call audio...");
        transcriptText.setTextSize(14);
        transcriptText.setTextColor(CLR_TEXT2);
        transcriptText.setLineSpacing(dp(4), 1f);
        LinearLayout.LayoutParams txLp = new LinearLayout.LayoutParams(-1, -2);
        txLp.topMargin = dp(10);
        transcriptText.setLayoutParams(txLp);
        transcriptCard.addView(transcriptText);
        content.addView(transcriptCard);

        scroll.addView(content);
        container.addView(scroll);
    }

    // â”€â”€ History Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void showHistoryTab() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(CLR_BG);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(16), dp(16), dp(120));

        // Header row
        LinearLayout hRow = new LinearLayout(this);
        hRow.setOrientation(LinearLayout.HORIZONTAL);
        hRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams hrLp = new LinearLayout.LayoutParams(-1, -2);
        hrLp.bottomMargin = dp(16);
        hRow.setLayoutParams(hrLp);
        TextView ht = mkBoldLabel("Call History", 20);
        LinearLayout.LayoutParams htLp = new LinearLayout.LayoutParams(0, -2);
        htLp.weight = 1f;
        ht.setLayoutParams(htLp);
        hRow.addView(ht);
        if (!history.isEmpty()) {
            TextView clr = new TextView(this);
            clr.setText("Clear All");
            clr.setTextSize(13);
            clr.setTextColor(CLR_DANGER);
            clr.setOnClickListener(v -> {
                history.clear();
                saveHistory();
                switchTab(1);
                Toast.makeText(this, "History cleared", Toast.LENGTH_SHORT).show();
            });
            hRow.addView(clr);
        }
        content.addView(hRow);

        if (history.isEmpty()) {
            LinearLayout empty = mkCard();
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(20), dp(40), dp(20), dp(40));
            TextView ei = new TextView(this);
            ei.setText("ðŸ“ž");
            ei.setTextSize(40);
            ei.setGravity(Gravity.CENTER);
            empty.addView(ei);
            TextView et = mkBoldLabel("No Calls Analyzed Yet", 16);
            et.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams etLp = new LinearLayout.LayoutParams(-1, -2);
            etLp.topMargin = dp(12);
            et.setLayoutParams(etLp);
            empty.addView(et);
            TextView es = mkLabel("Call history will appear here after your first protected call", 14, CLR_TEXT2);
            es.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams esLp = new LinearLayout.LayoutParams(-1, -2);
            esLp.topMargin = dp(8);
            es.setLayoutParams(esLp);
            empty.addView(es);
            content.addView(empty);
        } else {
            // Stats row
            int safe = 0, warn = 0, danger = 0;
            for (CallRecord r : history) {
                if (r.score < 0.3) safe++;
                else if (r.score < 0.6) warn++;
                else danger++;
            }
            LinearLayout statsRow = new LinearLayout(this);
            statsRow.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout.LayoutParams srLp = new LinearLayout.LayoutParams(-1, -2);
            srLp.bottomMargin = dp(16);
            statsRow.setLayoutParams(srLp);
            statsRow.addView(mkStatChip("" + safe,   "Safe",    CLR_SAFE));
            statsRow.addView(mkStatChip("" + warn,   "Caution", CLR_WARN));
            statsRow.addView(mkStatChip("" + danger, "Danger",  CLR_DANGER));
            content.addView(statsRow);

            for (CallRecord r : history) {
                content.addView(buildHistoryCard(r));
            }
        }

        scroll.addView(content);
        container.addView(scroll);
    }

    private View mkStatChip(String num, String lbl, int color) {
        LinearLayout chip = new LinearLayout(this);
        chip.setOrientation(LinearLayout.VERTICAL);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(dp(12), dp(16), dp(12), dp(16));
        GradientDrawable cbg = new GradientDrawable();
        cbg.setColor(CLR_SURFACE);
        cbg.setCornerRadius(dp(14));
        cbg.setStroke(dp(1), CLR_BORDER);
        chip.setBackground(cbg);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(0, -2);
        clp.weight = 1f;
        clp.rightMargin = dp(8);
        chip.setLayoutParams(clp);
        TextView nv = new TextView(this);
        nv.setText(num);
        nv.setTextSize(24);
        nv.setTypeface(Typeface.DEFAULT_BOLD);
        nv.setTextColor(color);
        nv.setGravity(Gravity.CENTER);
        chip.addView(nv);
        TextView lv = new TextView(this);
        lv.setText(lbl);
        lv.setTextSize(11);
        lv.setTextColor(CLR_TEXT2);
        lv.setGravity(Gravity.CENTER);
        chip.addView(lv);
        return chip;
    }

    private LinearLayout buildHistoryCard(CallRecord r) {
        LinearLayout card = mkCard();
        int rColor = r.score < 0.3 ? CLR_SAFE : r.score < 0.6 ? CLR_WARN : CLR_DANGER;
        String rLabel = r.score < 0.3 ? "SAFE" : r.score < 0.6 ? "CAUTION" : "SCAM";

        // Left accent bar
        GradientDrawable accent = new GradientDrawable();
        accent.setColor(rColor);
        accent.setCornerRadius(dp(4));
        View bar = new View(this);
        bar.setBackground(accent);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(dp(4), -1);
        blp.rightMargin = dp(14);
        bar.setLayoutParams(blp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(bar);

        LinearLayout info = new LinearLayout(this);
        info.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(0, -2);
        ilp.weight = 1f;
        info.setLayoutParams(ilp);

        TextView num = new TextView(this);
        num.setText(r.phoneNumber.isEmpty() ? "Unknown Number" : r.phoneNumber);
        num.setTextSize(16);
        num.setTypeface(Typeface.DEFAULT_BOLD);
        num.setTextColor(CLR_TEXT);
        info.addView(num);

        TextView time = new TextView(this);
        time.setText(r.timestamp);
        time.setTextSize(12);
        time.setTextColor(CLR_TEXT2);
        LinearLayout.LayoutParams tLp = new LinearLayout.LayoutParams(-1, -2);
        tLp.topMargin = dp(2);
        time.setLayoutParams(tLp);
        info.addView(time);

        if (!r.transcript.isEmpty()) {
            TextView preview = new TextView(this);
            String pr = r.transcript.length() > 60 ? r.transcript.substring(0, 60) + "..." : r.transcript;
            preview.setText(pr);
            preview.setTextSize(12);
            preview.setTextColor(CLR_TEXT2);
            preview.setMaxLines(1);
            LinearLayout.LayoutParams prLp = new LinearLayout.LayoutParams(-1, -2);
            prLp.topMargin = dp(4);
            preview.setLayoutParams(prLp);
            info.addView(preview);
        }

        row.addView(info);

        // Score badge
        LinearLayout scoreSide = new LinearLayout(this);
        scoreSide.setOrientation(LinearLayout.VERTICAL);
        scoreSide.setGravity(Gravity.CENTER);
        scoreSide.setPadding(dp(12), 0, 0, 0);

        TextView scoreV = new TextView(this);
        scoreV.setText(String.format(Locale.US, "%.0f%%", r.score * 100));
        scoreV.setTextSize(22);
        scoreV.setTypeface(Typeface.DEFAULT_BOLD);
        scoreV.setTextColor(rColor);
        scoreV.setGravity(Gravity.CENTER);
        scoreSide.addView(scoreV);

        TextView labelV = new TextView(this);
        labelV.setText(rLabel);
        labelV.setTextSize(10);
        labelV.setTypeface(Typeface.DEFAULT_BOLD);
        labelV.setTextColor(rColor);
        labelV.setLetterSpacing(0.1f);
        labelV.setGravity(Gravity.CENTER);
        scoreSide.addView(labelV);

        row.addView(scoreSide);
        card.addView(row);

        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(-1, -2);
        cardLp.bottomMargin = dp(12);
        card.setLayoutParams(cardLp);
        return card;
    }

    // â”€â”€ Settings Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void showSettingsTab() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(CLR_BG);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(16), dp(16), dp(120));

        content.addView(mkBoldLabelMargin("Settings", 20, 0, 0, 0, dp(20)));

        // API URLs card
        LinearLayout apiCard = mkCard();
        apiCard.addView(mkBoldLabel("API Configuration", 15));
        apiCard.addView(mkDivider());
        apiCard.addView(mkSettingField("STT Endpoint", sttUrl, val -> {
            sttUrl = val;
            prefs.edit().putString("stt", val).apply();
        }));
        apiCard.addView(mkSettingField("LLM Endpoint", llmUrl.replace("?q=", ""), val -> {
            llmUrl = val + "?q=";
            prefs.edit().putString("llm", llmUrl).apply();
        }));
        LinearLayout.LayoutParams acLp = new LinearLayout.LayoutParams(-1, -2);
        acLp.bottomMargin = dp(16);
        apiCard.setLayoutParams(acLp);
        content.addView(apiCard);

        // Toggles card
        LinearLayout toggleCard = mkCard();
        toggleCard.addView(mkBoldLabel("Behavior", 15));
        toggleCard.addView(mkDivider());
        toggleCard.addView(mkToggle("Auto Speaker On Call", autoSpeaker, val -> {
            autoSpeaker = val;
            prefs.edit().putBoolean("auto_speaker", val).apply();
        }));
        toggleCard.addView(mkToggle("Show Floating Window", showFloatOnCall, val -> {
            showFloatOnCall = val;
            prefs.edit().putBoolean("show_float", val).apply();
        }));
        LinearLayout.LayoutParams tcLp = new LinearLayout.LayoutParams(-1, -2);
        tcLp.bottomMargin = dp(16);
        toggleCard.setLayoutParams(tcLp);
        content.addView(toggleCard);

        // About card
        LinearLayout aboutCard = mkCard();
        aboutCard.addView(mkBoldLabel("About", 15));
        aboutCard.addView(mkDivider());
        aboutCard.addView(mkInfoRow("Version", "3.0 Pro"));
        aboutCard.addView(mkInfoRow("Engine", "Llama 3.1 via Workers"));
        aboutCard.addView(mkInfoRow("STT",    "Whisper API"));
        aboutCard.addView(mkInfoRow("Build",  "Sketchware Pro D8"));
        content.addView(aboutCard);

        scroll.addView(content);
        container.addView(scroll);
    }

    private View mkSettingField(String label, String val, FieldCallback cb) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, dp(10), 0, dp(10));
        TextView lbl = mkLabel(label, 12, CLR_TEXT2);
        row.addView(lbl);
        EditText et = new EditText(this);
        et.setText(val);
        et.setTextSize(14);
        et.setTextColor(CLR_TEXT);
        et.setBackgroundColor(Color.TRANSPARENT);
        et.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int st, int c, int a) {}
            public void onTextChanged(CharSequence s, int st, int b, int c) {}
            public void afterTextChanged(Editable s) { cb.onValue(s.toString()); }
        });
        row.addView(et);
        return row;
    }

    private View mkToggle(String label, boolean checked, ToggleCallback cb) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(12), 0, dp(12));
        TextView lbl = mkLabel(label, 14, CLR_TEXT);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2);
        lp.weight = 1f;
        lbl.setLayoutParams(lp);
        row.addView(lbl);
        Switch sw = new Switch(this);
        sw.setChecked(checked);
        sw.setOnCheckedChangeListener((v, c) -> cb.onToggle(c));
        row.addView(sw);
        return row;
    }

    private View mkInfoRow(String k, String v) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(10), 0, dp(10));
        TextView kv = mkBoldLabel(k, 14);
        LinearLayout.LayoutParams klp = new LinearLayout.LayoutParams(0, -2);
        klp.weight = 1f;
        kv.setLayoutParams(klp);
        row.addView(kv);
        row.addView(mkLabel(v, 14, CLR_TEXT2));
        return row;
    }

    interface FieldCallback  { void onValue(String v); }
    interface ToggleCallback { void onToggle(boolean v); }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // TRUECALLER-STYLE FLOATING WINDOW
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void showFloating() {
        if (floatShown || !showFloatOnCall) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return;
        try {
            floatRoot = new FrameLayout(this);

            // Collapsed pill
            LinearLayout pill = new LinearLayout(this);
            pill.setOrientation(LinearLayout.HORIZONTAL);
            pill.setGravity(Gravity.CENTER_VERTICAL);
            pill.setPadding(dp(12), dp(10), dp(16), dp(10));
            GradientDrawable pillBg = new GradientDrawable();
            pillBg.setColor(CLR_FLOAT_BG);
            pillBg.setCornerRadius(dp(30));
            pillBg.setStroke(dp(1), CLR_BORDER);
            pill.setBackground(pillBg);

            // Pulse dot
            floatPulse = new View(this);
            GradientDrawable pDot = new GradientDrawable();
            pDot.setShape(GradientDrawable.OVAL);
            pDot.setColor(CLR_SAFE);
            floatPulse.setBackground(pDot);
            LinearLayout.LayoutParams pdlp = new LinearLayout.LayoutParams(dp(10), dp(10));
            pdlp.rightMargin = dp(8);
            floatPulse.setLayoutParams(pdlp);
            pill.addView(floatPulse);

            LinearLayout textCol = new LinearLayout(this);
            textCol.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams tclp = new LinearLayout.LayoutParams(0, -2);
            tclp.weight = 1f;
            textCol.setLayoutParams(tclp);

            floatName = new TextView(this);
            floatName.setText(currentNumber.isEmpty() ? "Unknown" : currentNumber);
            floatName.setTextSize(13);
            floatName.setTypeface(Typeface.DEFAULT_BOLD);
            floatName.setTextColor(CLR_TEXT);
            textCol.addView(floatName);

            floatLabel = new TextView(this);
            floatLabel.setText("Analyzing...");
            floatLabel.setTextSize(11);
            floatLabel.setTextColor(CLR_TEXT2);
            textCol.addView(floatLabel);

            pill.addView(textCol);

            floatScore = new TextView(this);
            floatScore.setText("--");
            floatScore.setTextSize(14);
            floatScore.setTypeface(Typeface.DEFAULT_BOLD);
            floatScore.setTextColor(CLR_TEXT2);
            floatScore.setPadding(dp(8), 0, 0, 0);
            pill.addView(floatScore);

            // Expand detail section (hidden by default)
            floatDetail = new LinearLayout(this);
            floatDetail.setOrientation(LinearLayout.VERTICAL);
            floatDetail.setVisibility(View.GONE);
            floatDetail.setPadding(dp(12), dp(8), dp(12), dp(12));

            LinearLayout detRow = new LinearLayout(this);
            detRow.setOrientation(LinearLayout.HORIZONTAL);
            detRow.setGravity(Gravity.CENTER);
            String[] acts = {" End", " Mute", " Speaker"};
            for (String act : acts) {
                TextView ab = new TextView(this);
                ab.setText(act);
                ab.setTextSize(11);
                ab.setTextColor(CLR_TEXT);
                ab.setGravity(Gravity.CENTER);
                ab.setPadding(dp(12), dp(8), dp(12), dp(8));
                GradientDrawable abBg = new GradientDrawable();
                abBg.setColor(CLR_SURFACE2);
                abBg.setCornerRadius(dp(10));
                ab.setBackground(abBg);
                LinearLayout.LayoutParams ablp = new LinearLayout.LayoutParams(0, -2);
                ablp.weight = 1f;
                ablp.rightMargin = dp(6);
                ab.setLayoutParams(ablp);
                detRow.addView(ab);
            }
            floatDetail.addView(detRow);

            // Wrap in card
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            GradientDrawable cardBg = new GradientDrawable();
            cardBg.setColor(CLR_FLOAT_BG);
            cardBg.setCornerRadius(dp(20));
            cardBg.setStroke(dp(1), CLR_BORDER);
            card.setBackground(cardBg);
            card.addView(pill);
            card.addView(floatDetail);

            floatRoot.addView(card);

            WindowManager.LayoutParams wlp = new WindowManager.LayoutParams(
                dp(280), WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            );
            wlp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            wlp.y = dp(120);

            wm.addView(floatRoot, wlp);
            floatShown = true;

            // Drag support
            setupFloatDrag(floatRoot, card, wlp);

            // Tap to expand/collapse
            pill.setOnClickListener(v -> {
                if (floatExpanded) {
                    floatDetail.setVisibility(View.GONE);
                    floatExpanded = false;
                } else {
                    floatDetail.setVisibility(View.VISIBLE);
                    floatExpanded = true;
                }
            });

            // Entry animation
            floatRoot.setAlpha(0f);
            floatRoot.setTranslationY(-dp(20));
            floatRoot.animate().alpha(1f).translationY(0).setDuration(350)
                .setInterpolator(new OvershootInterpolator(1.2f)).start();

            // Pulse dot animation
            ValueAnimator pulseDot = ValueAnimator.ofFloat(0.5f, 1f, 0.5f);
            pulseDot.setDuration(1200);
            pulseDot.setRepeatCount(ValueAnimator.INFINITE);
            pulseDot.addUpdateListener(a -> {
    if (floatPulse != null && floatShown) {
        floatPulse.setAlpha((float) a.getAnimatedValue());
    }
});
            pulseDot.start();

        } catch (Exception e) {
            Log.e(TAG, "Float show error: " + e);
        }
    }

    private void setupFloatDrag(FrameLayout root, View card, WindowManager.LayoutParams lp) {
        final float[] lastX = {0}, lastY = {0};
        final boolean[] moved = {false};
        card.setOnTouchListener((v, e) -> {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    flDX = lp.x - e.getRawX();
                    flDY = lp.y - e.getRawY();
                    lastX[0] = e.getRawX(); lastY[0] = e.getRawY();
                    moved[0] = false;
                    return false;
                case MotionEvent.ACTION_MOVE:
                    if (Math.abs(e.getRawX() - lastX[0]) > 5 || Math.abs(e.getRawY() - lastY[0]) > 5) {
                        moved[0] = true;
                        lp.x = (int)(e.getRawX() + flDX);
                        lp.y = (int)(e.getRawY() + flDY);
                        try { wm.updateViewLayout(root, lp); } catch (Exception ex) {}
                    }
                    return moved[0];
                default:
                    return false;
            }
        });
    }

    private void updateFloating(double score) {
        if (floatScore == null || !floatShown) return;
        main.post(() -> {
            int pct = (int)(score * 100);
            int col = score < 0.3 ? CLR_SAFE : score < 0.6 ? CLR_WARN : CLR_DANGER;
            String lbl = score < 0.3 ? "âœ… Safe" : score < 0.6 ? "âš  Caution" : "ðŸš¨ SCAM";
            floatScore.setText(pct + "%");
            floatScore.setTextColor(col);
            floatLabel.setText(lbl);
            floatLabel.setTextColor(col);
            GradientDrawable dotBg = new GradientDrawable();
            dotBg.setShape(GradientDrawable.OVAL);
            dotBg.setColor(col);
            floatPulse.setBackground(dotBg);
        });
    }

    private void hideFloating() {
    try {
        if (!floatShown || floatRoot == null) return;

        final FrameLayout oldRoot = floatRoot;
        floatShown = false;
        floatExpanded = false;

        oldRoot.animate()
            .alpha(0f)
            .translationY(-dp(20))
            .setDuration(250)
            .withEndAction(() -> {
                try {
                    wm.removeView(oldRoot);
                } catch (Exception ignored) {
                }
            })
            .start();

        floatRoot = null;
        floatScore = null;
        floatLabel = null;
        floatPulse = null;
    } catch (Exception e) {
        Log.e(TAG, "Hide float", e);
    }
}

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // AUDIO RECORDING - MULTI-SOURCE WITH FALLBACK
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void startRecording() {
        if (recording) return;
        exec.execute(() -> {
            // Auto speaker for better call audio capture
            if (autoSpeaker) {
                main.post(() -> {
                    try {
                        audioMan.setMode(AudioManager.MODE_IN_CALL);
                        audioMan.setSpeakerphoneOn(true);
                    } catch (Exception e) { Log.w(TAG, "Speaker: " + e); }
                });
            }
            // Try all audio sources
            AudioRecord ar = null;
            for (int src : SOURCES) {
                try {
                    int bufSz = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CFG, AUDIO_FMT);
                    if (bufSz <= 0) bufSz = 4096;
                    AudioRecord tmp = new AudioRecord(src, SAMPLE_RATE, CHANNEL_CFG, AUDIO_FMT, bufSz * 4);
                    if (tmp.getState() == AudioRecord.STATE_INITIALIZED) {
                        tmp.startRecording();
                        if (tmp.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                            ar = tmp;
                            Log.d(TAG, "Recording with source: " + src);
                            break;
                        }
                        tmp.release();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Source " + src + " failed: " + e);
                }
            }
            if (ar == null) {
                Log.e(TAG, "All audio sources failed");
                main.post(() -> headerStatus.setText("  Mic unavailable - check permissions"));
                return;
            }
            recorder = ar;
            recording = true;
            final AudioRecord finalAr = ar;
            recordThread = new Thread(() -> {
                byte[] buf = new byte[4096];
                ByteArrayOutputStream chunk = new ByteArrayOutputStream();
                long chunkStart = System.currentTimeMillis();
                Log.d(TAG, "Record loop started");
                while (recording) {
                    int n = finalAr.read(buf, 0, buf.length);
                    if (n > 0) {
                        chunk.write(buf, 0, n);
                        // Update waveform
                        if (waveView != null) {
                            short s = (short)((buf[1] << 8) | (buf[0] & 0xff));
                            main.post(() -> { if(waveView!=null) waveView.addSample(s); });
                        }
                        long now = System.currentTimeMillis();
                        if (now - chunkStart >= CHUNK_MS) {
                            byte[] data = chunk.toByteArray();
                            chunkNo++;
                            processChunk(data);
                            chunk.reset();
                            chunkStart = now;
                        }
                    }
                }
                Log.d(TAG, "Record loop ended");
            });
            recordThread.start();
        });
    }

    private void stopRecording() {
        recording = false;
        try {
            if (recordThread != null) { recordThread.interrupt(); recordThread = null; }
            if (recorder != null) {
                recorder.stop();
                recorder.release();
                recorder = null;
            }
        } catch (Exception e) { Log.e(TAG, "Stop: " + e); }
        if (autoSpeaker) {
            try {
                audioMan.setSpeakerphoneOn(false);
                audioMan.setMode(AudioManager.MODE_NORMAL);
            } catch (Exception e) {}
        }
    }

    private void processChunk(byte[] pcmData) {
        exec.execute(() -> {
            Log.d(TAG, "Processing chunk #" + chunkNo + " size=" + pcmData.length);
            File wav = saveWav(pcmData);
            if (wav == null) return;
            String text = sendToSTT(wav);
            Log.d(TAG, "STT result: " + text);
            if (TextUtils.isEmpty(text)) return;
            double score = askLLM(text);
            Log.d(TAG, "LLM score: " + score);
            main.post(() -> {
                if (transcriptText != null) transcriptText.setText(text);
                if (riskScoreText != null) {
                    int pct = (int)(score * 100);
                    riskScoreText.setText(pct + "%");
                    int col = score < 0.3 ? CLR_SAFE : score < 0.6 ? CLR_WARN : CLR_DANGER;
                    riskScoreText.setTextColor(col);
                    if (riskLabel != null) {
                        riskLabel.setText(score < 0.3 ? "SAFE" : score < 0.6 ? "CAUTION" : "HIGH RISK");
                        riskLabel.setTextColor(col);
                    }
                    if (radarView != null) radarView.setThreatLevel((float) score);
                }
                updateFloating(score);
                if (keywordBox != null) updateKeywords(text, score);
            });
            // Save record
            CallRecord r = new CallRecord();
            r.phoneNumber = currentNumber;
            r.score = score;
            r.transcript = text;
            r.timestamp = new SimpleDateFormat("dd MMM, HH:mm", Locale.US).format(new Date());
            main.post(() -> { history.add(0, r); saveHistory(); });
        });
    }

    private void updateKeywords(String text, double score) {
        keywordBox.removeAllViews();
        String[] scamWords = {"bank", "otp", "account", "urgent", "prize", "winner", "verify",
            "suspended", "aadhaar", "pan", "police", "arrest", "payment", "transfer"};
        for (String word : scamWords) {
            if (text.toLowerCase().contains(word)) {
                TextView chip = new TextView(this);
                chip.setText(word);
                chip.setTextSize(11);
                chip.setTypeface(Typeface.DEFAULT_BOLD);
                chip.setPadding(dp(10), dp(5), dp(10), dp(5));
                chip.setTextColor(Color.WHITE);
                GradientDrawable cbg = new GradientDrawable();
                cbg.setColor(score > 0.5 ? CLR_DANGER : CLR_WARN);
                cbg.setCornerRadius(dp(20));
                chip.setBackground(cbg);
                LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-2, -2);
                clp.rightMargin = dp(6);
                chip.setLayoutParams(clp);
                keywordBox.addView(chip);
            }
        }
    }

    private File saveWav(byte[] pcm) {
        try {
            File dir = new File(getExternalFilesDir(null), "cg_chunks");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "chunk_" + chunkNo + ".wav");
            FileOutputStream out = new FileOutputStream(f);
            int dl = pcm.length; int br = SAMPLE_RATE * 2;
            byte[] h = new byte[44];
            h[0]='R'; h[1]='I'; h[2]='F'; h[3]='F';
            h[4]=(byte)(dl+36); h[5]=(byte)((dl+36)>>8); h[6]=(byte)((dl+36)>>16); h[7]=(byte)((dl+36)>>24);
            h[8]='W'; h[9]='A'; h[10]='V'; h[11]='E';
            h[12]='f'; h[13]='m'; h[14]='t'; h[15]=' ';
            h[16]=16; h[20]=1; h[22]=1;
            h[24]=(byte)(SAMPLE_RATE); h[25]=(byte)(SAMPLE_RATE>>8); h[26]=(byte)(SAMPLE_RATE>>16); h[27]=(byte)(SAMPLE_RATE>>24);
            h[28]=(byte)(br); h[29]=(byte)(br>>8); h[30]=(byte)(br>>16); h[31]=(byte)(br>>24);
            h[32]=2; h[34]=16;
            h[36]='d'; h[37]='a'; h[38]='t'; h[39]='a';
            h[40]=(byte)(dl); h[41]=(byte)(dl>>8); h[42]=(byte)(dl>>16); h[43]=(byte)(dl>>24);
            out.write(h); out.write(pcm); out.close();
            return f;
        } catch (Exception e) { Log.e(TAG, "WAV: " + e); return null; }
    }

    private String sendToSTT(File f) {
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                URL url = new URL(sttUrl);
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setConnectTimeout(12000);
                c.setReadTimeout(20000);
                c.setRequestProperty("Content-Type", "audio/wav");
                OutputStream os = c.getOutputStream();
                FileInputStream fis = new FileInputStream(f);
                byte[] buf = new byte[4096]; int n;
                while ((n = fis.read(buf)) != -1) os.write(buf, 0, n);
                fis.close(); os.close();
                int code = c.getResponseCode();
                if (code == 200) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    br.close();
                    JSONObject obj = new JSONObject(sb.toString());
                    return obj.optString("text", "");
                }
            } catch (Exception e) { Log.w(TAG, "STT attempt " + attempt + ": " + e); }
        }
        return "";
    }

    private double askLLM(String t) {
        try {
            String prompt = "You are a scam detector. Analyze this phone call transcript and reply with ONLY a decimal number between 0.0 and 1.0 representing scam probability. 0=safe, 1=scam.\n\n" + t;
            String url = llmUrl + URLEncoder.encode(prompt, "UTF-8");
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(12000);
            c.setReadTimeout(20000);
            int code = c.getResponseCode();
            if (code == 200) {
                BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                String res = sb.toString().trim();
                // Extract first decimal/number from response
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("[01]?[.]?[0-9]+").matcher(res);
                if (m.find()) {
                    double v = Double.parseDouble(m.group());
                    return Math.max(0, Math.min(1, v));
                }
            }
        } catch (Exception e) { Log.e(TAG, "LLM: " + e); }
        return 0.0;
    }

    private void testMic() {
        Toast.makeText(this, "Testing microphone...", Toast.LENGTH_SHORT).show();
        exec.execute(() -> {
            try {
                int bufSz = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CFG, AUDIO_FMT);
                AudioRecord ar = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE, CHANNEL_CFG, AUDIO_FMT, bufSz);
                if (ar.getState() == AudioRecord.STATE_INITIALIZED) {
                    ar.startRecording();
                    byte[] buf = new byte[bufSz];
                    ar.read(buf, 0, bufSz);
                    ar.stop(); ar.release();
                    main.post(() -> Toast.makeText(this, " Mic working!", Toast.LENGTH_SHORT).show());
                } else {
                    main.post(() -> Toast.makeText(this, "Mic init failed", Toast.LENGTH_SHORT).show());
                }
            } catch (Exception e) {
                main.post(() -> Toast.makeText(this, "Mic error: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CALL DETECTION
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void startCallDetection() {
        telephony = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        if (telephony == null) return;
        phoneListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String num) {
                switch (state) {
                    case TelephonyManager.CALL_STATE_RINGING:
                        currentNumber = num != null ? num : "Unknown";
                        main.post(() -> headerStatus.setText(" Incoming: " + currentNumber));
                        break;
                    case TelephonyManager.CALL_STATE_OFFHOOK:
                        if (!callActive) {
                            callActive = true;
                            main.post(() -> {
                                headerStatus.setText("”´ Call Active Analyzing");
                                showFloating();
                                startRecording();
                            });
                        }
                        break;
                    case TelephonyManager.CALL_STATE_IDLE:
                        if (callActive) {
                            callActive = false;
                            main.post(() -> {
                                headerStatus.setText(" Active Waiting for calls");
                                stopRecording();
                                hideFloating();
                            });
                        }
                        break;
                }
            }
        };
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
            telephony.listen(phoneListener, PhoneStateListener.LISTEN_CALL_STATE);
        }
        outgoingRcv = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent it) {
                if (Intent.ACTION_NEW_OUTGOING_CALL.equals(it.getAction())) {
                    String n = it.getStringExtra(Intent.EXTRA_PHONE_NUMBER);
                    if (n != null) currentNumber = n;
                    main.post(() -> headerStatus.setText(" Outgoing: " + currentNumber));
                }
            }
        };
        try { registerReceiver(outgoingRcv, new IntentFilter(Intent.ACTION_NEW_OUTGOING_CALL)); }
        catch (Exception e) { Log.w(TAG, "Outgoing rcv: " + e); }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PERMISSIONS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void checkPermissions() {
        String[] perms = {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.MODIFY_AUDIO_SETTINGS,
            Manifest.permission.PROCESS_OUTGOING_CALLS
        };
        boolean ok = true;
        for (String p : perms)
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) { ok = false; break; }
        if (!ok) { ActivityCompat.requestPermissions(this, perms, REQ_PERMS); return; }
        checkOverlay();
    }

    private void checkOverlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getPackageName())), REQ_OVR);
            return;
        }
        onReady();
    }

    private void onReady() {
        permsOk = true;
        headerStatus.setText("Active Waiting for calls");
        startCallDetection();
    }

    @Override
    public void onRequestPermissionsResult(int code, @NonNull String[] p, @NonNull int[] r) {
        super.onRequestPermissionsResult(code, p, r);
        if (code == REQ_PERMS) {
            boolean ok = true;
            for (int x : r) if (x != PackageManager.PERMISSION_GRANTED) { ok = false; break; }
            if (ok) checkOverlay();
            else Toast.makeText(this, "All permissions required for Call Guard AI", Toast.LENGTH_LONG).show();
        }
    }

    @Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == 9001 && resultCode == RESULT_OK && data != null) {
        Uri uri = data.getData();
        if (uri != null) {
            resultText.setText("Analyzing audio...");
            analyzeAudio(uri);
        } else {
            resultText.setText("No file selected");
        }
    }
}

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // DATA PERSISTENCE
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void loadSettings() {
        sttUrl           = prefs.getString("stt",         STT_URL);
        llmUrl           = prefs.getString("llm",         LLM_URL);
        silenceThreshold = prefs.getInt("silence",        30);
        autoSpeaker      = prefs.getBoolean("auto_speaker", true);
        showFloatOnCall  = prefs.getBoolean("show_float",   true);
    }

    private void loadHistory() {
        history.clear();
        try {
            JSONArray a = new JSONArray(prefs.getString("history", "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                CallRecord r = new CallRecord();
                r.phoneNumber = o.optString("num");
                r.score       = o.optDouble("score");
                r.transcript  = o.optString("text");
                r.timestamp   = o.optString("time");
                history.add(r);
            }
        } catch (Exception e) { Log.w(TAG, "History load: " + e); }
    }

    private void saveHistory() {
        try {
            JSONArray a = new JSONArray();
            for (CallRecord r : history) {
                JSONObject o = new JSONObject();
                o.put("num", r.phoneNumber); o.put("score", r.score);
                o.put("text", r.transcript); o.put("time", r.timestamp);
                a.put(o);
            }
            prefs.edit().putString("history", a.toString()).apply();
        } catch (Exception e) { Log.w(TAG, "History save: " + e); }
    }

    static class CallRecord {
        String phoneNumber = "", transcript = "", timestamp = "";
        double score = 0.0;
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // NASA RADAR VIEW
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    class RadarView extends View {
        Paint gridPaint  = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint sweepPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint dotPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint textPaint  = new Paint(Paint.ANTI_ALIAS_FLAG);
        float sweepAngle = 0f;
        float threatLevel = 0f;
        List<float[]> blips = new ArrayList<>();
        ValueAnimator sweepAnim;

        RadarView(Context c) {
            super(c);
            textPaint.setColor(Color.parseColor("#33FF66"));
            textPaint.setTextSize(dp(9));
            textPaint.setTextAlign(Paint.Align.CENTER);

            sweepAnim = ValueAnimator.ofFloat(0f, 360f);
            sweepAnim.setDuration(4000);
            sweepAnim.setRepeatCount(ValueAnimator.INFINITE);
            sweepAnim.addUpdateListener(a -> {
                sweepAngle = (float) a.getAnimatedValue();
                // Add random blips
                if (Math.random() < 0.04) {
                    float angle = (float)(Math.random() * 360);
                    float dist  = (float)(Math.random() * 0.85f);
                    blips.add(new float[]{angle, dist, 1.0f});
                }
                // Fade blips
                for (int i = blips.size()-1; i >= 0; i--) {
                    blips.get(i)[2] -= 0.008f;
                    if (blips.get(i)[2] <= 0) blips.remove(i);
                }
                invalidate();
            });
            sweepAnim.start();
        }

        void setThreatLevel(float level) { this.threatLevel = level; }

        @Override
        protected void onDraw(Canvas canvas) {
            int w = getWidth(), h = getHeight();
            int cx = w / 2, cy = h / 2;
            int r  = Math.min(cx, cy) - dp(16);
            canvas.drawColor(Color.parseColor("#04060E"));

            // Outer border glow
            Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
            glow.setColor(Color.parseColor("#1A33FF66"));
            glow.setStyle(Paint.Style.FILL);
            canvas.drawCircle(cx, cy, r + dp(6), glow);

            // Grid rings
            gridPaint.setStyle(Paint.Style.STROKE);
            gridPaint.setStrokeWidth(1f);
            for (int i = 1; i <= 4; i++) {
                float ringR = r * i / 4f;
                int alpha = 80 + i * 20;
                gridPaint.setColor(Color.argb(alpha, 0, 200, 80));
                canvas.drawCircle(cx, cy, ringR, gridPaint);
                // Ring label
                textPaint.setAlpha(100);
                canvas.drawText(i * 25 + "km", cx + ringR - dp(12), cy - dp(3), textPaint);
            }

            // Cross hairs
            gridPaint.setColor(Color.argb(60, 0, 200, 80));
            canvas.drawLine(cx - r, cy, cx + r, cy, gridPaint);
            canvas.drawLine(cx, cy - r, cx, cy + r, gridPaint);
            // Diagonal lines
            gridPaint.setColor(Color.argb(30, 0, 200, 80));
            float d = (float)(r * Math.cos(Math.PI/4));
            canvas.drawLine(cx-d, cy-d, cx+d, cy+d, gridPaint);
            canvas.drawLine(cx+d, cy-d, cx-d, cy+d, gridPaint);

            // Sweep gradient arc
            RectF rect = new RectF(cx-r, cy-r, cx+r, cy+r);
            sweepPaint.setStyle(Paint.Style.FILL);
            int sweepColor = threatLevel < 0.3f ? 0x4400CC55 : threatLevel < 0.6f ? 0x44FFAA00 : 0x44FF2200;
            sweepPaint.setShader(new android.graphics.SweepGradient(cx, cy,
                new int[]{Color.TRANSPARENT, sweepColor},
                new float[]{0f, 1f}));
            canvas.save();
            canvas.rotate(sweepAngle, cx, cy);
            canvas.drawArc(rect, 0, 90, true, sweepPaint);
            canvas.restore();
            sweepPaint.setShader(null);

            // Sweep line
            sweepPaint.setStyle(Paint.Style.STROKE);
            sweepPaint.setStrokeWidth(2.5f);
            sweepPaint.setColor(threatLevel < 0.3f ? Color.parseColor("#00FF66") :
                                 threatLevel < 0.6f ? Color.parseColor("#FFAA00") : Color.parseColor("#FF3300"));
            double ang = Math.toRadians(sweepAngle);
            canvas.drawLine(cx, cy, cx + (float)(r * Math.cos(ang)), cy + (float)(r * Math.sin(ang)), sweepPaint);

            // Blip dots
            dotPaint.setStyle(Paint.Style.FILL);
            for (float[] blip : blips) {
                double ba  = Math.toRadians(blip[0]);
                float  bx  = cx + (float)(r * blip[1] * Math.cos(ba));
                float  by  = cy + (float)(r * blip[1] * Math.sin(ba));
                dotPaint.setColor(Color.argb((int)(blip[2] * 255),
                    threatLevel > 0.5f ? 255 : 0,
                    threatLevel < 0.5f ? 255 : (int)(200 * (1 - threatLevel)),
                    0));
                canvas.drawCircle(bx, by, dp(4), dotPaint);
                // Blip glow
                dotPaint.setColor(Color.argb((int)(blip[2] * 80),
                    threatLevel > 0.5f ? 255 : 0,
                    threatLevel < 0.5f ? 255 : 100, 0));
                canvas.drawCircle(bx, by, dp(8), dotPaint);
            }

            // Center dot
            dotPaint.setColor(Color.parseColor("#00FF66"));
            canvas.drawCircle(cx, cy, dp(5), dotPaint);

            // N/S/E/W labels
            textPaint.setAlpha(180);
            textPaint.setTextSize(dp(10));
            canvas.drawText("N", cx,        cy-r+dp(12), textPaint);
            canvas.drawText("S", cx,        cy+r-dp(4),  textPaint);
            canvas.drawText("E", cx+r-dp(8),cy+dp(4),    textPaint);
            canvas.drawText("W", cx-r+dp(8),cy+dp(4),    textPaint);

            // Threat level text
            Paint tp2 = new Paint(Paint.ANTI_ALIAS_FLAG);
            tp2.setColor(sweepPaint.getColor());
            tp2.setTextSize(dp(9));
            tp2.setTextAlign(Paint.Align.LEFT);
            String tlText = "THREAT: " + (int)(threatLevel * 100) + "%";
            canvas.drawText(tlText, cx - r + dp(8), cy + r - dp(8), tp2);
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // WAVE VIEW
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    class WaveView extends View {
        Paint p   = new Paint(Paint.ANTI_ALIAS_FLAG);
        int[] samples = new int[120];
        int   head    = 0;

        WaveView(Context c) {
            super(c);
            p.setStyle(Paint.Style.FILL_AND_STROKE);
            p.setStrokeWidth(2f);
        }

        void addSample(short s) {
            samples[head % samples.length] = Math.abs(s) / 300;
            head++;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            canvas.drawColor(CLR_SURFACE);
            int w = getWidth(), h = getHeight();
            float mid = h / 2f;
            float barW = (float) w / samples.length;
            for (int i = 0; i < samples.length; i++) {
                float amp = Math.min(samples[(head + i) % samples.length], h / 2);
                float x   = i * barW;
                float ratio = (float) i / samples.length;
                int col = Color.argb(200,
                    (int)(64  + 160 * ratio),
                    (int)(130 - 100 * ratio),
                    (int)(255 - 100 * ratio));
                p.setColor(col);
                canvas.drawRoundRect(new RectF(x, mid - amp, x + barW - 1, mid + amp), 2, 2, p);
            }
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // UI HELPERS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private LinearLayout mkCard() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(18), dp(18), dp(18), dp(18));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(CLR_SURFACE);
        bg.setCornerRadius(dp(20));
        bg.setStroke(dp(1), CLR_BORDER);
        c.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(14);
        c.setLayoutParams(lp);
        return c;
    }

    private TextView mkLabel(String t, float size, int color) {
        TextView tv = new TextView(this);
        tv.setText(t);
        tv.setTextSize(size);
        tv.setTextColor(color);
        return tv;
    }

    private TextView mkBoldLabel(String t, float size) {
        TextView tv = mkLabel(t, size, CLR_TEXT);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    private TextView mkBoldLabelMargin(String t, float size, int l, int tp, int r, int b) {
        TextView tv = mkBoldLabel(t, size);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(l, tp, r, b);
        tv.setLayoutParams(lp);
        return tv;
    }

    private View mkDivider() {
        View v = new View(this);
        v.setBackgroundColor(CLR_BORDER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(1));
        lp.setMargins(0, dp(10), 0, dp(10));
        v.setLayoutParams(lp);
        return v;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel("callguard", "Call Guard AI", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
    
    

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopRecording();
        hideFloating();
        if (telephony != null && phoneListener != null)
            telephony.listen(phoneListener, PhoneStateListener.LISTEN_NONE);
        if (outgoingRcv != null)
            try { unregisterReceiver(outgoingRcv); } catch (Exception ignored) {}
        if (exec != null) exec.shutdownNow();
    }
}
