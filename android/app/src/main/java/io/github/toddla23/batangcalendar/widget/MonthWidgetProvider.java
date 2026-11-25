package io.github.toddla23.batangcalendar.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Calendar;

import io.github.toddla23.batangcalendar.R;

/** 월 달력 위젯 (F19): 42칸 격자, 칸 색, 공휴일, 메모 앞부분. ‹ › 로 달 이동. */
public class MonthWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "io.github.toddla23.batangcalendar.widget.MONTH_REFRESH";
    static final String ACTION_PREV = "io.github.toddla23.batangcalendar.widget.MONTH_PREV";
    static final String ACTION_NEXT = "io.github.toddla23.batangcalendar.widget.MONTH_NEXT";
    static final String ACTION_TODAY = "io.github.toddla23.batangcalendar.widget.MONTH_TODAY";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        // 시스템 주기 갱신(1시간) 또는 위젯을 처음 놓았을 때
        WidgetUpdater.refresh(ctx, false, goAsync()::finish);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, android.os.Bundle opts) {
        WidgetUpdater.redraw(ctx, goAsync()::finish);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (ACTION_REFRESH.equals(a)) {
            WidgetUpdater.refresh(ctx, true, goAsync()::finish);
        } else if (ACTION_PREV.equals(a) || ACTION_NEXT.equals(a) || ACTION_TODAY.equals(a)) {
            WidgetStore store = new WidgetStore(ctx);
            int off = ACTION_TODAY.equals(a) ? 0 : store.monthOffset(id) + (ACTION_PREV.equals(a) ? -1 : 1);
            store.setMonthOffset(id, off);
            // 다른 달은 바로 받아 와야 하므로 연속 탭 제한을 풀고 갱신
            store.setLastAttempt(0);
            WidgetUpdater.refresh(ctx, true, goAsync()::finish);
        } else {
            super.onReceive(ctx, intent);
        }
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        WidgetStore store = new WidgetStore(ctx);
        for (int id : ids) store.forgetWidget(id);
    }

    @Override
    public void onDisabled(Context ctx) {
        WidgetUpdater.onLastWidgetRemoved(ctx, goAsync()::finish);
    }

    static void render(Context ctx, AppWidgetManager mgr, int[] ids) {
        WidgetStore store = new WidgetStore(ctx);
        boolean linked = !WidgetStore.STATUS_UNLINKED.equals(store.status());
        JSONObject cache = store.cache();
        JSONObject notes = cache.optJSONObject("notes");
        JSONObject hols = cache.optJSONObject("holidays");
        String today = Dates.ymd(Dates.today());
        String status = WidgetUpdater.statusLine(store);

        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_month);
            Calendar first = Dates.monthStart(store.monthOffset(id));
            int month0 = first.get(Calendar.MONTH);
            rv.setTextViewText(R.id.title, first.get(Calendar.YEAR) + "년 " + (month0 + 1) + "월");
            rv.setTextViewText(R.id.status, status);
            rv.setOnClickPendingIntent(R.id.title, WidgetIntents.action(ctx, MonthWidgetProvider.class, ACTION_TODAY, id));
            rv.setOnClickPendingIntent(R.id.prev, WidgetIntents.action(ctx, MonthWidgetProvider.class, ACTION_PREV, id));
            rv.setOnClickPendingIntent(R.id.next, WidgetIntents.action(ctx, MonthWidgetProvider.class, ACTION_NEXT, id));
            rv.setOnClickPendingIntent(R.id.refresh, WidgetIntents.action(ctx, MonthWidgetProvider.class, ACTION_REFRESH, id));
            rv.setViewVisibility(R.id.unlinked, linked ? View.GONE : View.VISIBLE);
            rv.setViewVisibility(R.id.grid, linked ? View.VISIBLE : View.GONE);
            rv.setOnClickPendingIntent(R.id.link_btn, WidgetIntents.link(ctx));

            rv.removeAllViews(R.id.grid);
            if (linked) {
                String[] cells = Dates.monthCells(first);
                for (int row = 0; row < 6; row++) {
                    RemoteViews rowRv = new RemoteViews(ctx.getPackageName(), R.layout.widget_month_row);
                    for (int col = 0; col < 7; col++) {
                        String date = cells[row * 7 + col];
                        rowRv.addView(R.id.row, cell(ctx, date, col, month0, today, notes, hols));
                    }
                    rv.addView(R.id.grid, rowRv);
                }
            }
            mgr.updateAppWidget(id, rv);
        }
    }

    private static RemoteViews cell(Context ctx, String date, int col, int month0, String today, JSONObject notes, JSONObject hols) {
        RemoteViews c = new RemoteViews(ctx.getPackageName(), R.layout.widget_month_cell);
        JSONObject note = notes == null ? null : notes.optJSONObject(date);
        String hol = hols == null ? "" : hols.optString(date, "");
        boolean out = Integer.parseInt(date.substring(5, 7)) - 1 != month0;

        String day = String.valueOf(Integer.parseInt(date.substring(8)));
        c.setTextViewText(R.id.day, hol.isEmpty() ? day : day + " " + hol);
        int dayColor = out ? R.color.widget_muted
                : (!hol.isEmpty() || col == 0) ? R.color.widget_sun
                : col == 6 ? R.color.widget_sat : R.color.widget_text;
        textColor(ctx, c, R.id.day, dayColor);
        String text = note == null ? "" : note.optString("t", "");
        c.setTextViewText(R.id.text, text);
        textColor(ctx, c, R.id.text, out ? R.color.widget_muted : R.color.widget_text);

        String color = note == null ? null : note.optString("c", null);
        c.setInt(R.id.cell, "setBackgroundResource", Colors.cellBackground(color));
        c.setInt(R.id.cell_inner, "setBackgroundResource", date.equals(today) ? R.drawable.widget_cell_today : 0);
        c.setOnClickPendingIntent(R.id.cell, WidgetIntents.open(ctx, date));
        c.setContentDescription(R.id.cell, date + (hol.isEmpty() ? "" : " " + hol) + (text.isEmpty() ? "" : ", 메모: " + text));
        return c;
    }

    /** Android 12 이상은 색 리소스를 그대로 넘겨 라이트·다크 전환을 런처가 따르게 한다 */
    static void textColor(Context ctx, RemoteViews rv, int viewId, int colorRes) {
        if (Build.VERSION.SDK_INT >= 31) rv.setColorStateList(viewId, "setTextColor", colorRes);
        else rv.setTextColor(viewId, ctx.getColor(colorRes));
    }
}
