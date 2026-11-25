package io.github.toddla23.batangcalendar.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Iterator;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 위젯 저장소: 기기 토큰(Android Keystore 로 암호화, D-025), 연결 대기 verifier, 위젯별 달 이동, 받은 메모 캐시.
 * 모든 위젯이 토큰 하나와 캐시 하나를 같이 쓴다.
 */
final class WidgetStore {
    private static final String PREFS = "widget";
    private static final String KEY_ALIAS = "deskcal-widget-token";
    private static final String CACHE_FILE = "widget-cache.json";
    /** 연결 요청 뒤 이 시간 안에 코드가 와야 한다 */
    private static final long PENDING_MS = 10 * 60_000L;

    static final String STATUS_OK = "ok";
    static final String STATUS_OFFLINE = "offline";
    static final String STATUS_UNLINKED = "unlinked";

    private final Context ctx;
    private final SharedPreferences prefs;

    WidgetStore(Context context) {
        ctx = context.getApplicationContext();
        prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------- 토큰 ----------

    /** 저장된 토큰. 없거나 풀 수 없으면(백업에서 복원 등) null */
    String token() {
        String enc = prefs.getString("token", null);
        if (enc == null) return null;
        try {
            byte[] all = Base64.decode(enc, Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
            return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    void saveToken(String token, String email) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = c.getIV();
        byte[] ct = c.doFinal(token.getBytes(StandardCharsets.UTF_8));
        byte[] all = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, all, 0, iv.length);
        System.arraycopy(ct, 0, all, iv.length, ct.length);
        prefs.edit()
                .putString("token", Base64.encodeToString(all, Base64.NO_WRAP))
                .putString("email", email)
                .putString("status", STATUS_OK)
                .putLong("lastFetch", 0)
                .putLong("lastAttempt", 0)
                .apply();
    }

    /** 연결 해제: 토큰과 캐시를 지운다 (다른 계정 메모가 남지 않게) */
    void unlink() {
        prefs.edit().remove("token").remove("email").putString("status", STATUS_UNLINKED).putLong("lastFetch", 0).apply();
        //noinspection ResultOfMethodCallIgnored
        new File(ctx.getFilesDir(), CACHE_FILE).delete();
    }

    String email() {
        return prefs.getString("email", "");
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
            return kg.generateKey();
        }
        return (SecretKey) ks.getKey(KEY_ALIAS, null);
    }

    // ---------- 연결 대기 (PKCE) ----------

    /** 새 verifier 를 만들어 저장하고 challenge(S256) 를 돌려준다 */
    String startLink() throws Exception {
        byte[] b = new byte[32];
        new SecureRandom().nextBytes(b);
        String verifier = b64url(b);
        prefs.edit().putString("pendingVerifier", verifier).putLong("pendingAt", System.currentTimeMillis()).apply();
        return b64url(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
    }

    /** 대기 중인 verifier 를 꺼낸다 (한 번만). 오래됐으면 null */
    String takePendingVerifier() {
        String v = prefs.getString("pendingVerifier", null);
        long at = prefs.getLong("pendingAt", 0);
        prefs.edit().remove("pendingVerifier").remove("pendingAt").apply();
        return v != null && System.currentTimeMillis() - at < PENDING_MS ? v : null;
    }

    private static String b64url(byte[] b) {
        return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    // ---------- 상태 ----------

    String status() {
        if (token() == null) return STATUS_UNLINKED;
        return prefs.getString("status", STATUS_OK);
    }

    void setStatus(String s) {
        prefs.edit().putString("status", s).apply();
    }

    /** 마지막으로 서버에서 받은 시각 (ms) */
    long lastFetch() {
        return prefs.getLong("lastFetch", 0);
    }

    void setLastFetch(long ms) {
        prefs.edit().putLong("lastFetch", ms).apply();
    }

    /** 마지막으로 받으려고 시도한 시각 (연속 탭 무시용) */
    long lastAttempt() {
        return prefs.getLong("lastAttempt", 0);
    }

    void setLastAttempt(long ms) {
        prefs.edit().putLong("lastAttempt", ms).apply();
    }

    // ---------- 위젯별 달 이동 ----------

    int monthOffset(int widgetId) {
        return prefs.getInt("offset-" + widgetId, 0);
    }

    void setMonthOffset(int widgetId, int offset) {
        prefs.edit().putInt("offset-" + widgetId, Math.max(-120, Math.min(120, offset))).apply();
    }

    void forgetWidget(int widgetId) {
        prefs.edit().remove("offset-" + widgetId).apply();
    }

    // ---------- 캐시 ----------

    /** {notes: {date: {t, c}}, holidays: {date: name}} */
    synchronized JSONObject cache() {
        File f = new File(ctx.getFilesDir(), CACHE_FILE);
        if (f.exists()) {
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[(int) f.length()];
                int off = 0;
                while (off < buf.length) {
                    int n = in.read(buf, off, buf.length - off);
                    if (n < 0) break;
                    off += n;
                }
                JSONObject o = new JSONObject(new String(buf, 0, off, StandardCharsets.UTF_8));
                if (o.has("notes") && o.has("holidays")) return o;
            } catch (IOException | JSONException ignored) {
                // 깨진 캐시는 버리고 새로 받는다
            }
        }
        JSONObject o = new JSONObject();
        try {
            o.put("notes", new JSONObject());
            o.put("holidays", new JSONObject());
        } catch (JSONException ignored) {
        }
        return o;
    }

    /** 서버에서 받은 범위를 캐시에 반영한다: 그 범위의 예전 값은 지우고 새 값으로 */
    synchronized void mergeRange(JSONObject response) throws JSONException, IOException {
        JSONObject cache = cache();
        String from = response.getString("from");
        String to = response.getString("to");
        JSONObject notes = cache.getJSONObject("notes");
        JSONObject hols = cache.getJSONObject("holidays");
        // 오늘 앞뒤 1년 밖의 오래된 항목도 정리한다
        String today = Dates.ymd(Dates.today());
        String keepFrom = Dates.addDays(today, -400);
        String keepTo = Dates.addDays(today, 400);
        removeRange(notes, from, to, keepFrom, keepTo);
        removeRange(hols, from, to, keepFrom, keepTo);
        org.json.JSONArray ns = response.getJSONArray("notes");
        for (int i = 0; i < ns.length(); i++) {
            JSONObject n = ns.getJSONObject(i);
            JSONObject v = new JSONObject();
            v.put("t", n.optString("text", ""));
            if (!n.isNull("color")) v.put("c", n.getString("color"));
            notes.put(n.getString("date"), v);
        }
        org.json.JSONArray hs = response.getJSONArray("holidays");
        for (int i = 0; i < hs.length(); i++) {
            JSONObject h = hs.getJSONObject(i);
            String d = h.getString("date");
            String prev = hols.optString(d, "");
            hols.put(d, prev.isEmpty() ? h.getString("name") : prev + ", " + h.getString("name"));
        }
        File tmp = new File(ctx.getFilesDir(), CACHE_FILE + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(cache.toString().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(new File(ctx.getFilesDir(), CACHE_FILE))) throw new IOException("캐시 저장 실패");
    }

    private static void removeRange(JSONObject o, String from, String to, String keepFrom, String keepTo) {
        Iterator<String> it = o.keys();
        while (it.hasNext()) {
            String d = it.next();
            if ((d.compareTo(from) >= 0 && d.compareTo(to) <= 0) || d.compareTo(keepFrom) < 0 || d.compareTo(keepTo) > 0) {
                it.remove();
            }
        }
    }
}
