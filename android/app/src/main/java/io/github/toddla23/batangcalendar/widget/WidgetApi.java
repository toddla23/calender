package io.github.toddla23.batangcalendar.widget;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import io.github.toddla23.batangcalendar.R;

/** 위젯이 부르는 서버 API (03-protocol "위젯"). 메인 스레드에서 부르지 않는다. */
final class WidgetApi {
    /** 토큰이 폐기·만료됐거나 계정이 지워짐 → 다시 연결해야 한다 */
    static final class Unauthorized extends IOException {
        Unauthorized() {
            super("unauthorized");
        }
    }

    private final String base;

    WidgetApi(Context ctx) {
        base = "https://" + ctx.getString(R.string.hostName);
    }

    String base() {
        return base;
    }

    /** 일회용 코드 + verifier → {token, email} */
    JSONObject exchange(String code, String verifier) throws IOException, JSONException {
        JSONObject body = new JSONObject();
        body.put("code", code);
        body.put("verifier", verifier);
        return request("POST", "/api/auth/widget/exchange", null, body);
    }

    /** from~to 범위의 메모 앞부분과 공휴일 */
    JSONObject range(String token, String from, String to) throws IOException, JSONException {
        return request("GET", "/api/widget?from=" + enc(from) + "&to=" + enc(to), token, null);
    }

    /** 이 위젯 토큰 폐기 (위젯을 모두 지웠을 때) */
    void logout(String token) throws IOException, JSONException {
        request("POST", "/api/auth/logout", token, new JSONObject());
    }

    private JSONObject request(String method, String path, String token, JSONObject body) throws IOException, JSONException {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(5_000);
            c.setReadTimeout(8_000);
            c.setUseCaches(false);
            c.setRequestProperty("accept", "application/json");
            if (token != null) c.setRequestProperty("authorization", "Bearer " + token);
            if (body != null) {
                byte[] b = body.toString().getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("content-type", "application/json");
                c.setFixedLengthStreamingMode(b.length);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(b);
                }
            }
            int code = c.getResponseCode();
            if (code == 401) throw new Unauthorized();
            if (code < 200 || code >= 300) throw new IOException("HTTP " + code);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) {
                    buf.write(chunk, 0, n);
                    if (buf.size() > 2 * 1024 * 1024) throw new IOException("응답이 너무 큽니다");
                }
                return new JSONObject(buf.toString("UTF-8"));
            }
        } finally {
            c.disconnect();
        }
    }

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }
}
