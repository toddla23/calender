package io.github.toddla23.batangcalendar.widget;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import org.json.JSONObject;

import io.github.toddla23.batangcalendar.LauncherActivity;

/**
 * 위젯 연결 (D-025). 화면 없이 동작한다.
 * 1) 위젯의 "연결" → verifier 를 만들고 앱을 /?widget-link=<challenge> 로 연다
 * 2) 웹에서 확인하면 batangcalendar://widget-link?code=… 로 돌아온다 → 코드 + verifier 로 위젯 토큰을 받는다
 */
public class WidgetLinkActivity extends Activity {
    static final String ACTION_START = "io.github.toddla23.batangcalendar.widget.LINK_START";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        WidgetStore store = new WidgetStore(this);
        if (ACTION_START.equals(intent.getAction())) {
            try {
                String challenge = store.startLink();
                String url = new WidgetApi(this).base() + "/?widget-link=" + challenge;
                // 이 화면은 따로 떨어진 작업이라 앱 작업에서 열리게 NEW_TASK
                startActivity(new Intent(this, LauncherActivity.class).setData(Uri.parse(url))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) {
                Toast.makeText(this, "위젯 연결을 시작하지 못했습니다: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
            finish();
            return;
        }

        Uri data = intent.getData();
        String code = data == null ? null : data.getQueryParameter("code");
        String verifier = store.takePendingVerifier();
        if (code == null || verifier == null) {
            Toast.makeText(this, "연결 요청이 만료됐습니다. 위젯에서 \"연결\"을 다시 누르세요.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        new Thread(() -> {
            String msg;
            try {
                JSONObject r = new WidgetApi(this).exchange(code, verifier);
                store.saveToken(r.getString("token"), r.optString("email", ""));
                WidgetUpdater.refresh(this, true, null);
                msg = "위젯을 연결했습니다 (" + store.email() + ")";
            } catch (Exception e) {
                msg = "위젯 연결 실패: " + e.getMessage();
            }
            final String m = msg;
            runOnUiThread(() -> {
                Toast.makeText(getApplicationContext(), m, Toast.LENGTH_LONG).show();
                finish();
            });
        }).start();
    }
}
