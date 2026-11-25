package io.github.toddla23.batangcalendar.widget;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

/** 위젯 버튼·칸에 거는 PendingIntent. data 주소로 서로 구분해 덮어쓰지 않게 한다. */
final class WidgetIntents {
    private WidgetIntents() {}

    static final String EXTRA_DATE = "date";

    private static int immutable() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    /** 앱 열기 (date 가 있으면 그 날짜 편집). 열면서 위젯도 갱신한다 */
    static PendingIntent open(Context ctx, String date) {
        Intent i = new Intent(ctx, WidgetOpenActivity.class)
                .setData(Uri.parse("deskcal-widget://open/" + (date == null ? "" : date)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (date != null) i.putExtra(EXTRA_DATE, date);
        return PendingIntent.getActivity(ctx, 0, i, immutable());
    }

    /** 목록 위젯 항목용 템플릿: 항목마다 fillInIntent 로 날짜를 채우므로 mutable 이어야 한다 */
    static PendingIntent openTemplate(Context ctx) {
        Intent i = new Intent(ctx, WidgetOpenActivity.class)
                .setData(Uri.parse("deskcal-widget://open-template"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getActivity(ctx, 0, i, flags);
    }

    /** 위젯 연결 시작 */
    static PendingIntent link(Context ctx) {
        Intent i = new Intent(ctx, WidgetLinkActivity.class)
                .setAction(WidgetLinkActivity.ACTION_START)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, 0, i, immutable());
    }

    /** 위젯 provider 로 보내는 동작 (갱신, 달 이동) */
    static PendingIntent action(Context ctx, Class<?> provider, String action, int widgetId) {
        Intent i = new Intent(ctx, provider)
                .setAction(action)
                .setData(Uri.parse("deskcal-widget://" + action + "/" + widgetId))
                .putExtra(android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        return PendingIntent.getBroadcast(ctx, 0, i, immutable());
    }
}
