package io.github.toddla23.batangcalendar.widget;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import io.github.toddla23.batangcalendar.LauncherActivity;

/**
 * 위젯의 칸·항목을 탭했을 때: 위젯을 갱신하고(D-024) 앱을 그 날짜로 연다 (웹이 /?date= 를 보고 편집 시트를 연다).
 * 화면 없이 바로 끝난다.
 */
public class WidgetOpenActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WidgetUpdater.refresh(this, true, null);
        String date = getIntent().getStringExtra(WidgetIntents.EXTRA_DATE);
        boolean valid = date != null && date.matches("\\d{4}-\\d{2}-\\d{2}");
        String url = new WidgetApi(this).base() + (valid ? "/?date=" + date : "/");
        startActivity(new Intent(this, LauncherActivity.class).setData(Uri.parse(url)));
        finish();
    }
}
