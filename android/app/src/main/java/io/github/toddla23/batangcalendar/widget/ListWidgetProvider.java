package io.github.toddla23.batangcalendar.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import io.github.toddla23.batangcalendar.R;

/** 다가오는 메모 위젯 (F19): 오늘부터 60일 안에 메모·색이 있는 날의 목록. */
public class ListWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "io.github.toddla23.batangcalendar.widget.LIST_REFRESH";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        WidgetUpdater.refresh(ctx, false, goAsync()::finish);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            WidgetUpdater.refresh(ctx, true, goAsync()::finish);
        } else {
            super.onReceive(ctx, intent);
        }
    }

    @Override
    public void onDisabled(Context ctx) {
        WidgetUpdater.onLastWidgetRemoved(ctx, goAsync()::finish);
    }

    @SuppressWarnings("deprecation") // setRemoteAdapter(int, Intent): minSdk 24 에서도 되는 방식
    static void render(Context ctx, AppWidgetManager mgr, int[] ids) {
        WidgetStore store = new WidgetStore(ctx);
        boolean linked = !WidgetStore.STATUS_UNLINKED.equals(store.status());
        String status = WidgetUpdater.statusLine(store);
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
            rv.setTextViewText(R.id.status, status);
            rv.setOnClickPendingIntent(R.id.title, WidgetIntents.open(ctx, null));
            rv.setOnClickPendingIntent(R.id.refresh, WidgetIntents.action(ctx, ListWidgetProvider.class, ACTION_REFRESH, id));
            rv.setViewVisibility(R.id.unlinked, linked ? View.GONE : View.VISIBLE);
            rv.setViewVisibility(R.id.list_box, linked ? View.VISIBLE : View.GONE);
            rv.setOnClickPendingIntent(R.id.link_btn, WidgetIntents.link(ctx));

            Intent svc = new Intent(ctx, ListWidgetService.class)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
            rv.setRemoteAdapter(R.id.list, svc);
            rv.setEmptyView(R.id.list, R.id.empty);
            rv.setPendingIntentTemplate(R.id.list, WidgetIntents.openTemplate(ctx));
            mgr.updateAppWidget(id, rv);
        }
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.list);
    }
}
